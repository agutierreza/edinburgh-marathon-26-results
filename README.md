# Edinburgh Marathon Results

I was checking the results of the marathon last Sunday in Edinburgh, where I live, out of curiosity. But seeing how rigid the official results website is, it motivated me to scrape the data and vibe code this small dashboard to analyse and compare finish times.

## What it does
- **Scraper**: A Python script to scrape results for both male and female runners from the official website.
- **Anonymisation**: A script to anonymise runner names and club names (using random but realistic names) so the dashboard can be shared online without publishing personal data.
- **Interactive Dashboard**: A simple dark-themed page using Chart.js where you can:
  - See finish time distributions (histograms).
  - Search by name, club, or exact dorsal (bib) number.
  - Filter by age categories and sex.
  - Toggle between Chip Time and Gun Time.
  - Find a runner to see their position and percentile within their category cohort (and highlight where they lie on the histogram).

---

## Setup

This project uses [Poetry](https://python-poetry.org/) for Python dependencies.

To set up the environment and install dependencies:
```bash
poetry install
```

---

## How to generate the data

Generating the data for the dashboard is a simple two-step process:

### 1. Run the Scraper
Scrape the results from the website. This will save the raw results for both men and women:
```bash
poetry run python marathon.py
```
This generates:
- `edinburgh_marathon_mens_results.csv`
- `edinburgh_marathon_womens_results.csv`

### 2. Combine and format the data
Combine and clean the results. You can run this in two modes:

#### Public Version (Anonymised)
Generates fake names and clubs to protect privacy when publishing online:
```bash
poetry run python combine_data.py --anonymise
```
This creates:
- `edinburgh_marathon_results_anonymised.csv`
- `data.js` (the database loaded by the webpage)

#### Private Version (Real Data)
Preserves the real runner names and clubs for local use:
```bash
poetry run python combine_data.py
```
This creates:
- `edinburgh_marathon_results.csv`
- `data.js` (the database loaded by the webpage)

---

## Running the Web Dashboard

To open the dashboard, simply double-click **`index.html`** in your browser.
