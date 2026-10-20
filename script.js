document.addEventListener('DOMContentLoaded', () => {
  const FALL_SPREADSHEET_ID = '1SNQ9rxjQFzGrS90DRWyTSUcDm9Vmi1NmG7NNRGYU8Jo';
  const WINTER_SPREADSHEET_ID = '13e102KoGKMPKQBIIo0MzzlGmiMZ7ZnKxOH3fbwOqaGk';

  // Configured with both the main Dates tab (gid=0) and Additional Info tab (gid=1921163845)
  const SHEETS = [
    {
      term: 'Fall 2026',
      datesUrl: `https://docs.google.com/spreadsheets/d/${FALL_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`,
      matrixUrl: `https://docs.google.com/spreadsheets/d/${FALL_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1921163845`
    },
    {
      term: 'Winter 2027',
      datesUrl: `https://docs.google.com/spreadsheets/d/${WINTER_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`,
      matrixUrl: `https://docs.google.com/spreadsheets/d/${WINTER_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1220139405`
    }
  ];

  let calendarData = {
    dates: [],
    matrix: {}
  };

  let activeTerm = 'Fall 2026';
  let activeView = 'list'; // 'list' or 'matrix'

  const displayContainer = document.getElementById('calendarContentDisplay');
  const searchInput = document.getElementById('calendarSearchInput');
  const searchControls = document.getElementById('searchControls');
  const tabContainer = document.getElementById('semesterTabs');
  const viewSwitcher = document.getElementById('viewSwitcher');

  loadAllSources();

  function loadAllSources() {
    const fetchTasks = [];

    SHEETS.forEach(sheetConfig => {
      // 1. Fetch Important Dates List
      fetchTasks.push(
        fetch(sheetConfig.datesUrl)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP error on ${sheetConfig.term} dates`);
            return res.text();
          })
          .then(csvText => parseDatesCSV(csvText, sheetConfig.term))
          .then(entries => { calendarData.dates.push(...entries); })
          .catch(err => console.warn(`Failed to load dates for ${sheetConfig.term}:`, err))
      );

      // 2. Fetch Session Matrix Table (Additional Info)
      fetchTasks.push(
        fetch(sheetConfig.matrixUrl)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP error on ${sheetConfig.term} matrix`);
            return res.text();
          })
          .then(csvText => parseMatrixCSV(csvText))
          .then(matrixObj => {
            if (matrixObj) calendarData.matrix[sheetConfig.term] = matrixObj;
          })
          .catch(err => console.warn(`Failed to load matrix for ${sheetConfig.term}:`, err))
      );
    });

    Promise.all(fetchTasks).then(() => {
      console.log('Loaded dates:', calendarData.dates);
      console.log('Loaded matrix tables:', calendarData.matrix);

      if (calendarData.dates.length === 0) {
        displayContainer.innerHTML = '<p class="error-msg">Unable to load calendar events. Please check sheet sharing permissions.</p>';
        return;
      }

      renderView();
    });
  }

  // --- PARSERS ---

  function parseDatesCSV(text, fallbackTerm) {
    const rawRows = parseCSVToRows(text);
    const entries = [];
    let currentTerm = fallbackTerm;

    rawRows.forEach(row => {
      const clean = row.map(c => c.trim().replace(/^"|"$/g, ''));
      const col0 = clean[0] || '';
      const col1 = clean[1] || '';

      if (!col0 && !col1) return;

      const termMatch = col0.match(/(Fall|Winter|Summer|Spring)\s+\d{4}/i);
      if (termMatch) {
        currentTerm = termMatch[0];
        return;
      }

      if (col0.toLowerCase().includes('click for more dates')) return;

      if (col0 && col1) {
        entries.push({ Term: currentTerm, Date: col0, Event: col1 });
      }
    });

    return entries;
  }

  function parseMatrixCSV(text) {
    const rawRows = parseCSVToRows(text);
    if (rawRows.length < 2) return null;

    let title = '';
    let headers = [];
    let sessionRows = [];
    let footnotes = [];

    // Fallback headers if CSV has missing/blank header cells
    const DEFAULT_HEADERS = [
      'Session',
      'Begin Date 7:30 a.m.',
      'End Date 10 p.m.',
      'Last Day to Drop Classes for 100% Refund',
      'Last Day for Registration Without Permission',
      'Last Day of Late Registration with Permission',
      'Fin Aid Credit Lock Date 11:59 p.m. *',
      'First Day of "W"',
      'Last Day of "W"',
      'Final Exams Begin',
      'Final Exams End',
      'Title IV Return **',
      'Grades Roll 10 a.m.'
    ];

    rawRows.forEach(row => {
      // Clean leading/trailing spaces and quotes
      const clean = row.map(c => c.trim().replace(/^"|"$/g, ''));
      if (clean.every(c => c === '')) return;

      const firstCell = clean[0] || '';

      // 1. Identify Title Row
      if (firstCell.toLowerCase().includes('additional information')) {
        title = firstCell;
      } 
      // 2. Identify Column Header Row
      else if (firstCell.toLowerCase().startsWith('session')) {
        // Capture non-empty header cells, or pad with defaults if trailing headers are blank
        headers = clean.map((h, i) => h !== '' ? h : (DEFAULT_HEADERS[i] || `Col ${i + 1}`));
      } 
      // 3. Identify Session Data Rows (Matches any session prefix e.g. "1 -", "F -", "S -", "C -", "W -")
      else if (
        /^[a-z0-9]\s*[-–]/i.test(firstCell) || 
        firstCell.toLowerCase().includes('term') || 
        firstCell.toLowerCase().includes('half') || 
        firstCell.toLowerCase().includes('competency')
      ) {
        sessionRows.push(clean);
      } 
      // 4. Everything else is treated as a Footnote
      else if (firstCell) {
        footnotes.push(firstCell);
      }
    });

    if (headers.length === 0) headers = DEFAULT_HEADERS;
    if (!title) title = 'Additional Information';

    // Normalize all session rows so every row matches the exact length of headers
    const targetColCount = headers.length;
    const normalizedSessionRows = sessionRows.map(row => {
      const paddedRow = [...row];
      while (paddedRow.length < targetColCount) {
        paddedRow.push('-');
      }
      return paddedRow.slice(0, targetColCount);
    });

    return { title, headers, sessionRows: normalizedSessionRows, footnotes };
  }

  function parseCSVToRows(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell);
        if (currentRow.some(c => c.trim() !== '')) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }
    return rows;
  }

  // --- RENDER ROUTER ---

  function renderView() {
    // Disable or hide view switcher button when "All" tab is active
    if (activeTerm === 'All') {
      activeView = 'list';
      if (viewSwitcher) viewSwitcher.style.display = 'none';
    } else {
      if (viewSwitcher) viewSwitcher.style.display = 'flex';
    }

    if (activeView === 'list') {
      searchControls.style.display = 'block';
      renderListView();
    } else {
      searchControls.style.display = 'none';
      renderMatrixView();
    }
  }

  function renderListView() {
    const query = searchInput.value.toLowerCase().trim();

    const filtered = calendarData.dates.filter(item => {
      const matchTerm = activeTerm === 'All' || item.Term.toLowerCase() === activeTerm.toLowerCase();
      const matchSearch = !query || 
        item.Date.toLowerCase().includes(query) || 
        item.Event.toLowerCase().includes(query);

      return matchTerm && matchSearch;
    });

    if (filtered.length === 0) {
      displayContainer.innerHTML = '<p class="no-results">No dates found matching your search criteria.</p>';
      return;
    }

    let html = '<ul class="important-dates-list">';
    filtered.forEach(row => {
      const formattedEvent = row.Event.replace(/\n/g, '<br>');
      html += `
        <li class="date-row-item">
          <div class="date-column">${row.Date}</div>
          <div class="event-column">
            <span class="event-title">${formattedEvent}</span>
          </div>
        </li>
      `;
    });
    html += '</ul>';

    displayContainer.innerHTML = html;
  }

function renderMatrixView() {
    // "All dates" tab explicitly does not render the matrix table
    if (activeTerm === 'All') {
      renderListView();
      return;
    }

    const matrix = calendarData.matrix[activeTerm];

    if (!matrix || !matrix.headers || matrix.headers.length === 0) {
      displayContainer.innerHTML = `<p class="no-results">Session deadline matrix is not available for ${activeTerm}.</p>`;
      return;
    }

    let html = `<div class="additional-info-section">`;
    html += `<h3 class="matrix-title">${matrix.title}</h3>`;
    html += `<div class="table-responsive"><table class="session-matrix-table"><thead><tr>`;

    // Render Table Header Row
    matrix.headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Render Table Body Rows
    matrix.sessionRows.forEach(row => {
      html += `<tr>`;
      matrix.headers.forEach((_, idx) => {
        const cell = row[idx] && row[idx] !== '' ? row[idx] : '-';
        const isHeaderCol = idx === 0;
        const tag = isHeaderCol ? 'th' : 'td';
        html += `<${tag} ${isHeaderCol ? 'class="session-name"' : ''}>${cell}</${tag}>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;

    // Render Footnotes
    if (matrix.footnotes && matrix.footnotes.length > 0) {
      html += `<div class="matrix-footnotes">`;
      matrix.footnotes.forEach(note => {
        html += `<p>${note}</p>`;
      });
      html += `</div>`;
    }

    html += `</div>`;

    displayContainer.innerHTML = html;
  }

  // --- EVENT LISTENERS ---

// Semester Tab Switcher
  tabContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-link')) {
      // 1. Update active tab UI
      document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      activeTerm = e.target.getAttribute('data-term');

      // 2. Default view back to 'list' on term change
      activeView = 'list';

      // 3. Reset View Switcher button states
      if (viewSwitcher) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        const defaultListBtn = viewSwitcher.querySelector('[data-view="list"]');
        if (defaultListBtn) defaultListBtn.classList.add('active');
      }

      // 4. Render the view
      renderView();
    }
  });

  if (viewSwitcher) {
    viewSwitcher.addEventListener('click', (e) => {
      if (e.target.classList.contains('view-btn')) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        activeView = e.target.getAttribute('data-view');
        renderView();
      }
    });
  }

  searchInput.addEventListener('input', renderView);
});