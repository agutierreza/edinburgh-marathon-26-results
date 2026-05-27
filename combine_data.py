import pandas as pd
import json
import re
import os
import argparse
from faker import Faker

def parse_time_to_seconds(time_str):
    if pd.isna(time_str):
        return None
    time_str = str(time_str).strip()
    parts = time_str.split(':')
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return None

def main():
    parser = argparse.ArgumentParser(description="Combine and format Edinburgh Marathon results.")
    parser.add_argument('--anonymise', action='store_true', help="Anonymise runner names and club names for the public site.")
    args = parser.parse_args()

    print("Combining and formatting marathon results...")
    if args.anonymise:
        print("Anonymisation mode is ENABLED. Runner names and club names will be faked.")
    else:
        print("Anonymisation mode is DISABLED. Real names and club names will be kept.")
    
    # Load files
    mens_file = "edinburgh_marathon_mens_results.csv"
    womens_file = "edinburgh_marathon_womens_results.csv"
    
    if not os.path.exists(mens_file) or not os.path.exists(womens_file):
        print("Error: Source files missing. Make sure both CSVs are in the workspace.")
        return
        
    df_m = pd.read_csv(mens_file)
    df_w = pd.read_csv(womens_file)
    
    # Add gender column
    df_m['Gender'] = 'Male'
    df_w['Gender'] = 'Female'
    
    # Combine
    df = pd.concat([df_m, df_w], ignore_index=True)
    
    # Clean name and bib number
    names = []
    bibs = []
    name_num_pat = re.compile(r"^(.*?)\s+(\d+)$")
    
    for val in df['Name Number']:
        val_str = str(val).strip()
        m = name_num_pat.match(val_str)
        if m:
            names.append(m.group(1).strip())
            bibs.append(int(m.group(2)))
        else:
            names.append(val_str)
            bibs.append(None)
            
    df['Name'] = names
    df['Bib'] = bibs
    
    # Parse category
    age_groups = []
    category_map = {
        'U35': 'Under 35',
        '35': '35-39',
        '40': '40-44',
        '45': '45-49',
        '50': '50-54',
        '55': '55-59',
        '60': '60-64',
        '65': '65-69',
        '70': '70-74',
        '75': '75-79',
        '80': '80-84',
        '85': '85+',
        'WM': 'Wheelchair'
    }
    
    for val in df['Position (Category)']:
        if pd.isna(val):
            age_groups.append('Unknown')
            continue
        tokens = str(val).split()
        if not tokens:
            age_groups.append('Unknown')
            continue
        cat_code = tokens[-1]
        
        # Strip trailing M or F (e.g. U35M -> U35, 40F -> 40)
        # Note: 'WM' represents Wheelchair Male, let's keep it as WM for mapping
        if cat_code != 'WM':
            if cat_code.endswith('M') or cat_code.endswith('F'):
                cat_code = cat_code[:-1]
                
        age_group = category_map.get(cat_code, cat_code)
        age_groups.append(age_group)
        
    df['AgeGroup'] = age_groups
    
    # Clean Club
    df['Club'] = df['Club'].fillna('Individual').strip() if hasattr(df['Club'], 'strip') else df['Club'].fillna('Individual')
    df['Club'] = df['Club'].apply(lambda x: str(x).strip())
    
    # Parse times
    df['ChipSeconds'] = df['Chip Time'].apply(parse_time_to_seconds)
    df['GunSeconds'] = df['Gun Time'].apply(parse_time_to_seconds)
    
    # Clean positions
    # Position (Overall) might be an integer or string
    df['Position'] = pd.to_numeric(df['Position (Overall)'], errors='coerce')
    
    # Drop rows without valid times (if any)
    df = df.dropna(subset=['ChipSeconds'])
    
    # Sort by Chip Time (ascending) to get a fair ranking, or by overall position
    df = df.sort_values(by='ChipSeconds').reset_index(drop=True)
    
    # Apply Anonymisation if argument is passed
    if args.anonymise:
        print("Generating faked runner names and club names (seeding for reproducibility)...")
        # Initialize Faker with British English locale for realistic names and cities
        fake = Faker('en_GB')
        Faker.seed(42)
        
        # Anonymise Names based on Gender (prefixes excluded)
        fake_names = []
        for gender in df['Gender']:
            if gender == 'Male':
                fake_names.append(f"{fake.first_name_male()} {fake.last_name()}")
            else:
                fake_names.append(f"{fake.first_name_female()} {fake.last_name()}")
        df['Name'] = fake_names
        
        # Anonymise Clubs keeping original groups
        club_map = {}
        club_suffixes = ['Harriers', 'Athletics Club', 'Road Runners', 'AC', 'Running Club', 'Striders', 'Joggers']
        fake_clubs = []
        for orig_club in df['Club']:
            orig_clean = str(orig_club).strip()
            if orig_clean.lower() in ['individual', 'unattached', 'none', 'n/a', '', 'independent']:
                fake_clubs.append(orig_clean)
            else:
                if orig_clean not in club_map:
                    city = fake.city()
                    suffix = fake.random.choice(club_suffixes)
                    club_map[orig_clean] = f"{city} {suffix}"
                fake_clubs.append(club_map[orig_clean])
        df['Club'] = fake_clubs
    
    # Output combined CSV
    if args.anonymise:
        output_csv = "edinburgh_marathon_results_anonymised.csv"
    else:
        output_csv = "edinburgh_marathon_results.csv"
        
    df.to_csv(output_csv, index=False)
    print(f"Saved {len(df)} rows to {output_csv}")
    
    # Output JS data file (this file is always loaded by index.html)
    js_data = []
    for _, row in df.iterrows():
        js_data.append({
            'pos': int(row['Position']) if not pd.isna(row['Position']) else None,
            'bib': int(row['Bib']) if not pd.isna(row['Bib']) else None,
            'name': row['Name'],
            'club': row['Club'],
            'gender': row['Gender'],
            'age': row['AgeGroup'],
            'csecs': int(row['ChipSeconds']),
            'ctime': row['Chip Time'],
            'gsecs': int(row['GunSeconds']) if not pd.isna(row['GunSeconds']) else None,
            'gtime': row['Gun Time'] if not pd.isna(row['Gun Time']) else None
        })
        
    output_js = "data.js"
    with open(output_js, 'w', encoding='utf-8') as f:
        f.write("const marathonData = ")
        json.dump(js_data, f, separators=(',', ':'))
        f.write(";")
        
    print(f"Saved compact data to {output_js} ({os.path.getsize(output_js) / 1024:.2f} KB)")

if __name__ == "__main__":
    main()
