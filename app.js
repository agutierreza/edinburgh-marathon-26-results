/**
 * Interactive Plotting Tool for Edinburgh Marathon Results
 * Manages data filtering, statistical analysis, and rendering visualisations.
 */

// Initial State
let selectedGender = 'All';
let selectedAgeGroups = [];
let minSeconds = 7200; // 2 hours
let maxSeconds = 36000; // 10 hours
let searchQuery = '';
let binWidthSeconds = 300; // 5 minutes (default)
let timeType = 'chip'; // 'chip' or 'gun'
let currentPage = 1;
const pageSize = 25;
let filteredData = [];
let chartInstance = null;
let selectedRunner = null;

// Initialisation when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initialiseAgeGroups();
    initialiseEventListeners();
    updateTableHeaderHighlighting();
    applyFiltersAndRender();
});

/**
 * Extracts unique age categories and populates the sidebar checkboxes
 */
function initialiseAgeGroups() {
    const ageGroupsContainer = document.getElementById('age-groups-container');
    
    // Extract unique age groups from raw data
    const uniqueGroups = [...new Set(marathonData.map(item => item.age))];
    
    // Sort age groups logically (numeric sorting, placing Under 35 first and Wheelchair last)
    uniqueGroups.sort((a, b) => {
        if (a === 'Under 35') return -1;
        if (b === 'Under 35') return 1;
        if (a === 'Wheelchair') return 1;
        if (b === 'Wheelchair') return -1;
        if (a === '85+') return 1;
        if (b === '85+') return -1;
        return a.localeCompare(b, undefined, { numeric: true });
    });

    // Default: select all categories
    selectedAgeGroups = [...uniqueGroups];

    // Generate checkboxes
    ageGroupsContainer.innerHTML = '';
    uniqueGroups.forEach(group => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = group;
        checkbox.checked = true;
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!selectedAgeGroups.includes(group)) {
                    selectedAgeGroups.push(group);
                }
            } else {
                selectedAgeGroups = selectedAgeGroups.filter(g => g !== group);
            }
            currentPage = 1;
            applyFiltersAndRender();
        });
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(group));
        ageGroupsContainer.appendChild(label);
    });
}

/**
 * Registers all change and input event listeners
 */
function initialiseEventListeners() {
    // Gender Button Selectors
    const genderBtns = document.querySelectorAll('.gender-btn');
    genderBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active styling
            genderBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            selectedGender = e.target.getAttribute('data-gender');
            currentPage = 1;
            applyFiltersAndRender();
        });
    });

    // Search Input with standard debounce (matches name, club, or dorsal number)
    const searchInput = document.getElementById('search-input');
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchQuery = e.target.value.toLowerCase().trim();
            currentPage = 1;
            applyFiltersAndRender();
        }, 300);
    });

    // Time Type Selector
    const timeTypeSelect = document.getElementById('time-type-select');
    timeTypeSelect.addEventListener('change', (e) => {
        timeType = e.target.value;
        updateTableHeaderHighlighting();
        currentPage = 1;
        applyFiltersAndRender();
    });

    // Time Range Dropdowns
    const minTimeSelect = document.getElementById('min-time-select');
    const maxTimeSelect = document.getElementById('max-time-select');
    
    minTimeSelect.addEventListener('change', (e) => {
        minSeconds = parseInt(e.target.value);
        if (minSeconds >= maxSeconds) {
            maxSeconds = minSeconds + 3600;
            maxTimeSelect.value = maxSeconds;
        }
        currentPage = 1;
        applyFiltersAndRender();
    });

    maxTimeSelect.addEventListener('change', (e) => {
        maxSeconds = parseInt(e.target.value);
        if (maxSeconds <= minSeconds) {
            minSeconds = Math.max(7200, maxSeconds - 3600);
            minTimeSelect.value = minSeconds;
        }
        currentPage = 1;
        applyFiltersAndRender();
    });

    // Bin Width Selector
    const binWidthSelect = document.getElementById('bin-width-select');
    binWidthSelect.addEventListener('change', (e) => {
        binWidthSeconds = parseInt(e.target.value);
        renderCharts();
    });

    // Pagination Buttons
    document.getElementById('pagination-btn-prev').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    document.getElementById('pagination-btn-next').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });

    // Clear Personal Selection Button
    const clearPersonalBtn = document.getElementById('clear-personal-btn');
    if (clearPersonalBtn) {
        clearPersonalBtn.addEventListener('click', () => {
            selectedRunner = null;
            applyFiltersAndRender();
        });
    }

    // Table Action Buttons (Event Delegation)
    document.getElementById('table-body').addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-view-stats')) {
            const bib = e.target.getAttribute('data-bib');
            const runner = marathonData.find(r => String(r.bib) === String(bib));
            if (runner) {
                selectRunner(runner);
            }
        }
    });
}

/**
 * Sets the selected runner, updates filters to match their cohort, and re-renders
 */
function selectRunner(runner) {
    selectedRunner = runner;
    
    // Update filters
    selectedGender = runner.gender;
    
    // Update UI buttons
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    const genderBtn = document.querySelector(`.gender-btn[data-gender="${runner.gender}"]`);
    if (genderBtn) genderBtn.classList.add('active');

    // Update age groups (keep only runner's age group)
    selectedAgeGroups = [runner.age];
    
    // Update UI checkboxes
    const checkboxes = document.querySelectorAll('#age-groups-container input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = (cb.value === runner.age);
    });

    // Clear search
    searchQuery = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    // Render (this will re-calculate stats for the new cohort)
    currentPage = 1;
    applyFiltersAndRender();
}

/**
 * Highlights the column header in the table based on the selected time type
 */
function updateTableHeaderHighlighting() {
    const thChip = document.getElementById('th-chip-time');
    const thGun = document.getElementById('th-gun-time');
    if (!thChip || !thGun) return;
    
    if (timeType === 'chip') {
        thChip.style.color = 'var(--accent-success)';
        thChip.style.fontWeight = '700';
        thGun.style.color = 'var(--text-secondary)';
        thGun.style.fontWeight = '600';
    } else {
        thGun.style.color = 'var(--accent-success)';
        thGun.style.fontWeight = '700';
        thChip.style.color = 'var(--text-secondary)';
        thChip.style.fontWeight = '600';
    }
}

/**
 * Filter dataset based on current sidebar selections and compute stats
 */
function applyFiltersAndRender() {
    filteredData = marathonData.filter(runner => {
        // Gender filter
        if (selectedGender !== 'All' && runner.gender !== selectedGender) {
            return false;
        }
        
        // Age groups filter
        if (!selectedAgeGroups.includes(runner.age)) {
            return false;
        }
        
        // Time filter (evaluates chip or gun time based on state)
        const runnerSecs = timeType === 'chip' ? runner.csecs : (runner.gsecs || runner.csecs);
        if (runnerSecs < minSeconds || runnerSecs > maxSeconds) {
            return false;
        }
        
        // Search query (matches name, club, or exact dorsal/bib number)
        if (searchQuery) {
            const nameMatch = runner.name.toLowerCase().includes(searchQuery);
            const clubMatch = runner.club.toLowerCase().includes(searchQuery);
            const bibMatch = runner.bib && String(runner.bib) === searchQuery;
            if (!nameMatch && !clubMatch && !bibMatch) {
                return false;
            }
        }
        
        return true;
    });

    // Sort data dynamically based on the active time type
    filteredData.sort((a, b) => {
        const secA = timeType === 'chip' ? a.csecs : (a.gsecs || a.csecs);
        const secB = timeType === 'chip' ? b.csecs : (b.gsecs || b.csecs);
        return secA - secB;
    });

    // Update Stats
    calculateStatistics();
    
    // Update Personal Stats if applicable
    updatePersonalStats();
    
    // Render chart and table
    renderCharts();
    renderTable();
}

/**
 * Calculates and displays the personalised percentile and stats for the selected runner
 */
function updatePersonalStats() {
    const panel = document.getElementById('personal-stats-panel');
    if (!panel) return;
    
    if (!selectedRunner) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex';
    document.getElementById('personal-runner-name').textContent = selectedRunner.name;
    document.getElementById('personal-time-type-label').textContent = timeType === 'chip' ? 'Chip' : 'Gun';
    
    // Find the selected runner in the CURRENT filteredData
    const runnerIndex = filteredData.findIndex(r => String(r.bib) === String(selectedRunner.bib));
    
    if (runnerIndex === -1) {
        // They were filtered out by the user's manual filter changes!
        document.getElementById('personal-runner-pos').textContent = '--';
        document.getElementById('personal-runner-percentile').textContent = '--';
        document.getElementById('personal-runner-time').textContent = '--:--:--';
        document.getElementById('personal-stats-message').textContent = 'This runner is currently hidden by your active filters.';
    } else {
        const pos = runnerIndex + 1;
        const total = filteredData.length;
        // Percentile is the percentage of people they beat or tied (so 100 - (pos/total)*100) or just "Top X%"
        const percentile = total > 1 ? ((pos / total) * 100).toFixed(1) : 100;
        
        document.getElementById('personal-runner-pos').textContent = `${pos.toLocaleString()} of ${total.toLocaleString()}`;
        document.getElementById('personal-runner-percentile').textContent = `Top ${percentile}%`;
        document.getElementById('personal-runner-time').textContent = timeType === 'chip' ? selectedRunner.ctime : (selectedRunner.gtime || selectedRunner.ctime);
        
        // Build descriptive message
        const groupDesc = selectedAgeGroups.length === 1 && selectedAgeGroups[0] === selectedRunner.age && selectedGender === selectedRunner.gender 
            ? `their specific category (${selectedGender} / ${selectedRunner.age})` 
            : `the current custom selection of ${total.toLocaleString()} runners`;
            
        document.getElementById('personal-stats-message').textContent = `Based on ${timeType} time, they placed ${pos.toLocaleString()} out of ${total.toLocaleString()} in ${groupDesc}.`;
    }
}

/**
 * Helper to format seconds into HH:MM:SS
 */
function formatSeconds(secs) {
    if (secs === null || secs === undefined || isNaN(secs)) return '--:--:--';
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Computes average, median, fastest, and slowest finish times
 */
function calculateStatistics() {
    const total = filteredData.length;
    document.getElementById('stat-total-runners').textContent = total.toLocaleString();

    if (total === 0) {
        document.getElementById('stat-avg-time').textContent = '--:--:--';
        document.getElementById('stat-median-time').textContent = '--:--:--';
        document.getElementById('stat-fastest-time').textContent = '--:--:--';
        document.getElementById('stat-slowest-time').textContent = '--:--:--';
        return;
    }

    const getSecs = (runner) => timeType === 'chip' ? runner.csecs : (runner.gsecs || runner.csecs);

    // Fastest & Slowest (filteredData is already pre-sorted by the active time metric)
    const fastest = getSecs(filteredData[0]);
    const slowest = getSecs(filteredData[total - 1]);

    // Average
    const sum = filteredData.reduce((acc, curr) => acc + getSecs(curr), 0);
    const avg = Math.round(sum / total);

    // Median
    let median;
    const mid = Math.floor(total / 2);
    if (total % 2 !== 0) {
        median = getSecs(filteredData[mid]);
    } else {
        median = Math.round((getSecs(filteredData[mid - 1]) + getSecs(filteredData[mid])) / 2);
    }

    // Display formatted results
    document.getElementById('stat-avg-time').textContent = formatSeconds(avg);
    document.getElementById('stat-median-time').textContent = formatSeconds(median);
    document.getElementById('stat-fastest-time').textContent = formatSeconds(fastest);
    document.getElementById('stat-slowest-time').textContent = formatSeconds(slowest);
}

/**
 * Helper to format time bin range for chart labels
 */
function formatBinLabel(startSecs, widthSecs) {
    const endSecs = startSecs + widthSecs;
    const format = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${h}:${String(m).padStart(2, '0')}`;
    };
    return `${format(startSecs)} - ${format(endSecs)}`;
}

/**
 * Creates and renders the histogram using Chart.js
 */
function renderCharts() {
    if (chartInstance) {
        chartInstance.destroy();
    }

    const ctx = document.getElementById('histogram-chart').getContext('2d');
    
    // Update visual subtitle message
    document.getElementById('chart-filtered-info').textContent = 
        `Displaying distributions for ${filteredData.length.toLocaleString()} runners`;

    if (filteredData.length === 0) {
        // Draw empty state
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = '16px Plus Jakarta Sans';
        ctx.fillStyle = '#9ca3af';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No data fits the selected filters.', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const getSecs = (runner) => timeType === 'chip' ? runner.csecs : (runner.gsecs || runner.csecs);

    // Determine bounds for histogram bins
    const actualMin = Math.min(...filteredData.map(getSecs));
    const actualMax = Math.max(...filteredData.map(getSecs));
    
    // Align bin boundaries to multiples of binWidthSeconds
    const binStart = Math.floor(actualMin / binWidthSeconds) * binWidthSeconds;
    const binEnd = Math.ceil(actualMax / binWidthSeconds) * binWidthSeconds;
    
    // Generate bins list
    const bins = [];
    for (let s = binStart; s < binEnd; s += binWidthSeconds) {
        bins.push({
            start: s,
            end: s + binWidthSeconds,
            label: formatBinLabel(s, binWidthSeconds),
            maleCount: 0,
            femaleCount: 0,
            totalCount: 0
        });
    }

    // Populate bins with runners
    filteredData.forEach(runner => {
        const secs = getSecs(runner);
        const binIndex = Math.floor((secs - binStart) / binWidthSeconds);
        if (binIndex >= 0 && binIndex < bins.length) {
            bins[binIndex].totalCount++;
            if (runner.gender === 'Male') {
                bins[binIndex].maleCount++;
            } else {
                bins[binIndex].femaleCount++;
            }
        }
    });

    const labels = bins.map(b => b.label);
    let datasets = [];

    // Determine the bin index of the selected runner
    let selectedBinIndex = -1;
    if (selectedRunner) {
        const rIndex = filteredData.findIndex(r => String(r.bib) === String(selectedRunner.bib));
        if (rIndex !== -1) {
            const selectedRunnerSecs = getSecs(selectedRunner);
            selectedBinIndex = Math.floor((selectedRunnerSecs - binStart) / binWidthSeconds);
        }
    }

    const getBgColor = (isMale) => {
        const base = isMale ? 'rgba(14, 165, 233, 0.5)' : 'rgba(244, 63, 94, 0.5)';
        const highlight = 'rgba(16, 185, 129, 0.9)'; // emerald green
        return bins.map((b, i) => {
            if (selectedBinIndex === i) {
                if (isMale && selectedRunner.gender === 'Male') return highlight;
                if (!isMale && selectedRunner.gender !== 'Male') return highlight;
            }
            return base;
        });
    };

    const getBorderColor = (isMale) => {
        const base = isMale ? '#0ea5e9' : '#f43f5e';
        const highlight = '#10b981';
        return bins.map((b, i) => {
            if (selectedBinIndex === i) {
                if (isMale && selectedRunner.gender === 'Male') return highlight;
                if (!isMale && selectedRunner.gender !== 'Male') return highlight;
            }
            return base;
        });
    };

    if (selectedGender === 'All') {
        // Stacked/Overlaid male & female dataset for side-by-side comparison
        datasets = [
            {
                label: 'Male Finishers',
                data: bins.map(b => b.maleCount),
                backgroundColor: getBgColor(true),
                borderColor: getBorderColor(true),
                borderWidth: 1.5,
                borderRadius: 4,
                barPercentage: 1.0,
                categoryPercentage: 0.95
            },
            {
                label: 'Female Finishers',
                data: bins.map(b => b.femaleCount),
                backgroundColor: getBgColor(false),
                borderColor: getBorderColor(false),
                borderWidth: 1.5,
                borderRadius: 4,
                barPercentage: 1.0,
                categoryPercentage: 0.95
            }
        ];
    } else if (selectedGender === 'Male') {
        datasets = [{
            label: 'Male Finishers',
            data: bins.map(b => b.maleCount),
            backgroundColor: getBgColor(true),
            borderColor: getBorderColor(true),
            borderWidth: 1.5,
            borderRadius: 4,
            barPercentage: 1.0,
            categoryPercentage: 0.95
        }];
    } else {
        datasets = [{
            label: 'Female Finishers',
            data: bins.map(b => b.femaleCount),
            backgroundColor: getBgColor(false),
            borderColor: getBorderColor(false),
            borderWidth: 1.5,
            borderRadius: 4,
            barPercentage: 1.0,
            categoryPercentage: 0.95
        }];
    }

    const xAxisTitle = `${timeType === 'chip' ? 'Chip' : 'Gun (Global)'} Finish Time (Hours:Minutes)`;

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#f3f4f6',
                        font: {
                            family: 'Plus Jakarta Sans',
                            weight: '600'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    titleColor: '#f3f4f6',
                    bodyColor: '#f3f4f6',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    titleFont: {
                        family: 'Plus Jakarta Sans',
                        weight: '700'
                    },
                    bodyFont: {
                        family: 'Plus Jakarta Sans'
                    },
                    padding: 12,
                    callbacks: {
                        title: (context) => `Finisher Window: ${context[0].label}`
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            family: 'Plus Jakarta Sans',
                            size: 10
                        },
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        autoSkipPadding: 20
                    },
                    title: {
                        display: true,
                        text: xAxisTitle,
                        color: '#9ca3af',
                        font: {
                            family: 'Plus Jakarta Sans',
                            weight: '600'
                        }
                    }
                },
                y: {
                    stacked: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            family: 'Plus Jakarta Sans'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Number of Finishers',
                        color: '#9ca3af',
                        font: {
                            family: 'Plus Jakarta Sans',
                            weight: '600'
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders the paginated data table of finishers
 */
function renderTable() {
    const tableBody = document.getElementById('table-body');
    const prevBtn = document.getElementById('pagination-btn-prev');
    const nextBtn = document.getElementById('pagination-btn-next');
    const paginationInfo = document.getElementById('pagination-info');
    const tableFilteredInfo = document.getElementById('table-filtered-info');

    const total = filteredData.length;
    tableFilteredInfo.textContent = `Showing sorted results`;

    if (total === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 32px;">No runners match your selection.</td></tr>`;
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        paginationInfo.textContent = `Showing 0 to 0 of 0 runners`;
        return;
    }

    const totalPages = Math.ceil(total / pageSize);
    
    // Bounds check for current page
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    
    const pageData = filteredData.slice(startIndex, endIndex);

    tableBody.innerHTML = '';
    pageData.forEach((runner) => {
        const row = document.createElement('tr');
        
        // Style Gender Badge
        const genderBadgeClass = runner.gender === 'Male' ? 'badge badge-male' : 'badge badge-female';
        const genderBadge = `<span class="${genderBadgeClass}">${runner.gender}</span>`;

        // Highlight active sorting time
        const chipTimeStyle = timeType === 'chip' 
            ? 'font-family: monospace; font-weight: 700; color: var(--accent-success); text-align: right;' 
            : 'font-family: monospace; color: var(--text-secondary); text-align: right;';
        const gunTimeStyle = timeType === 'gun' 
            ? 'font-family: monospace; font-weight: 700; color: var(--accent-success); text-align: right;' 
            : 'font-family: monospace; color: var(--text-secondary); text-align: right;';

        row.innerHTML = `
            <td style="font-weight: 700;">#${runner.pos || '-'}</td>
            <td style="font-family: monospace; font-weight: 600;">${runner.bib || '-'}</td>
            <td style="font-weight: 500; color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span title="${escapeHtml(runner.name)}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${escapeHtml(runner.name)}</span>
                    <button class="btn-view-stats" data-bib="${runner.bib}">Analyse</button>
                </div>
            </td>
            <td>${escapeHtml(runner.club)}</td>
            <td>${genderBadge}</td>
            <td style="font-weight: 600;">${runner.age}</td>
            <td style="${chipTimeStyle}">${runner.ctime}</td>
            <td style="${gunTimeStyle}">${runner.gtime || '-'}</td>
        `;
        tableBody.appendChild(row);
    });

    // Update buttons
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;

    // Update label text
    paginationInfo.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${total.toLocaleString()} runners`;
}

/**
 * Escapes HTML characters to prevent XSS bugs
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
