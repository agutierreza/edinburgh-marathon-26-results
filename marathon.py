import pandas as pd
import requests
import io
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor
import time

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

def has_table(page, base_url):
    """
    Checks if a page contains any results tables.
    """
    url = f"{base_url}{page}"
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            return False
        tables = pd.read_html(io.StringIO(response.text))
        if tables and not tables[0].empty:
            return True
    except Exception:
        pass
    return False

def find_last_page(base_url):
    """
    Determines the last page containing results using binary search.
    """
    print("Finding the last results page using binary search...")
    low = 1
    high = 2000  # Reasonable upper bound
    last_page = 1
    
    # Quick probe to find a higher upper bound if necessary
    while has_table(high, base_url):
        last_page = high
        high *= 2
        
    low = last_page
    while low <= high:
        mid = (low + high) // 2
        if has_table(mid, base_url):
            last_page = mid
            low = mid + 1
        else:
            high = mid - 1
            
    print(f"Found last page containing results: {last_page}")
    return last_page

def fetch_page_data(page, base_url, max_retries=3):
    """
    Fetches the table data from a single results page.
    """
    url = f"{base_url}{page}"
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"HTTP {response.status_code} for page {page} on attempt {attempt+1}")
                continue
            tables = pd.read_html(io.StringIO(response.text))
            if tables and not tables[0].empty:
                return page, tables[0]
            else:
                return page, None
        except Exception as e:
            print(f"Error fetching page {page} on attempt {attempt+1}: {e}")
            time.sleep(0.5)
    return page, None

def scrape_category(gender_name, base_url, output_file):
    print(f"\n========================================")
    print(f"Scraping results for: {gender_name}")
    print(f"========================================")
    
    start_time = time.time()
    
    last_page = find_last_page(base_url)
    if last_page == 0 or not has_table(1, base_url):
        print(f"No results found for {gender_name}. Please check connection/URL.")
        return False
        
    print(f"Starting concurrent extraction of {last_page} pages...")
    results = [None] * (last_page + 1)
    
    # Fetching pages concurrently to speed up the process
    max_workers = 10
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_page_data, p, base_url): p for p in range(1, last_page + 1)}
        
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            page, df = future.result()
            results[page] = df
            completed += 1
            if completed % 50 == 0 or completed == last_page:
                print(f"Downloaded {completed}/{last_page} pages...")
                
    # Combine results in the correct order
    all_dfs = [df for df in results[1:] if df is not None]
    
    if all_dfs:
        final_df = pd.concat(all_dfs, ignore_index=True)
        
        # Clean up the hidden "EXPAND" rows that the HTML table renders
        if 'Position (Overall)' in final_df.columns:
            final_df = final_df[~final_df['Position (Overall)'].astype(str).str.contains('EXPAND', case=False, na=False)]
            
        # Save the full list to a CSV file in the same folder
        final_df.to_csv(output_file, index=False)
        
        elapsed = time.time() - start_time
        print(f"Success! Saved {len(final_df)} rows for {gender_name} to {output_file} in {elapsed:.2f} seconds.")
        return True
    else:
        print(f"No data was extracted for {gender_name}.")
        return False

def main():
    overall_start = time.time()
    
    targets = [
        {
            'gender': 'Male Finishers',
            'file_name': 'edinburgh_marathon_mens_results.csv',
            'url': 'https://www.edinburghmarathon.com/results?event=1060&gender=M&rs=438&page='
        },
        {
            'gender': 'Female Finishers',
            'file_name': 'edinburgh_marathon_womens_results.csv',
            'url': 'https://www.edinburghmarathon.com/results?event=1060&gender=F&rs=438&page='
        }
    ]
    
    success_count = 0
    for target in targets:
        if scrape_category(target['gender'], target['url'], target['file_name']):
            success_count += 1
            
    print(f"\n========================================")
    print(f"Extraction pipeline complete.")
    print(f"Successfully scraped {success_count}/{len(targets)} categories.")
    print(f"Total time elapsed: {time.time() - overall_start:.2f} seconds.")
    print(f"========================================")

if __name__ == "__main__":
    main()