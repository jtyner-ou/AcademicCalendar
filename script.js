document.addEventListener('DOMContentLoaded', () => {
  const FALL_SPREADSHEET_ID = '1SNQ9rxjQFzGrS90DRWyTSUcDm9Vmi1NmG7NNRGYU8Jo';
  const WINTER_SPREADSHEET_ID = '13e102KoGKMPKQBIIo0MzzlGmiMZ7ZnKxOH3fbwOqaGk';
  const CALENDAR_2026_2027_ID = '1Jgtz3sItC0XLOoaupgH82fcZ2u5PyAxEBt7n3O4Xvks';
  const CALENDAR_2027_2028_ID = '12T07vbMVCi4zmKjVCQTk87csymOlysBedFD619PQc2w';

  const SHEETS = [
    {
      term: 'Fall 2026',
      datesUrl: `https://docs.google.com/spreadsheets/d/${FALL_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`,
      matrixUrl: `https://docs.google.com/spreadsheets/d/${FALL_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1921163845`,
      isMultiSemester: false
    },
    {
      term: 'Winter 2027',
      datesUrl: `https://docs.google.com/spreadsheets/d/${WINTER_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`,
      matrixUrl: `https://docs.google.com/spreadsheets/d/${WINTER_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1220139405`,
      isMultiSemester: false
    },
    {
      term: '2026-2027 Calendar',
      datesUrl: `https://docs.google.com/spreadsheets/d/${CALENDAR_2026_2027_ID}/gviz/tq?tqx=out:csv&gid=0`,
      matrixUrl: null,
      isMultiSemester: true
    },
    {
      term: '2027-2028 Calendar',
      datesUrl: `https://docs.google.com/spreadsheets/d/${CALENDAR_2027_2028_ID}/gviz/tq?tqx=out:csv&gid=0`,
      matrixUrl: null,
      isMultiSemester: true
    }
  ];

  let calendarData = {
    dates: [],
    matrix: {}
  };

  let activeTerm = 'Fall 2026';
  let activeSubSemester = 'All';
  let activeView = 'list';

  const displayContainer = document.getElementById('calendarContentDisplay');
  const searchInput = document.getElementById('calendarSearchInput');
  const searchControls = document.getElementById('searchControls');
  const tabContainer = document.getElementById('semesterTabs');
  const viewSwitcher = document.getElementById('viewSwitcher');

  loadAllSources();

  function loadAllSources() {
    const fetchTasks = [];

    SHEETS.forEach(sheetConfig => {
      fetchTasks.push(
        fetch(sheetConfig.datesUrl)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP error on ${sheetConfig.term} dates`);
            return res.text();
          })
          .then(csvText => parseDatesCSV(csvText, sheetConfig.term, sheetConfig.isMultiSemester))
          .then(entries => { calendarData.dates.push(...entries); })
          .catch(err => console.warn(`Failed to load dates for ${sheetConfig.term}:`, err))
      );

      if (sheetConfig.matrixUrl) {
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
      }
    });

    Promise.all(fetchTasks).then(() => {
      if (calendarData.dates.length === 0) {
        displayContainer.innerHTML = '<p class="error-msg">Unable to load calendar events. Please check sheet sharing permissions.</p>';
        return;
      }

      renderView();
    });
  }

  // --- PARSERS ---

  function parseDatesCSV(text, parentCalendarGroup, isMultiSemester) {
    const rawRows = parseCSVToRows(text);
    const entries = [];
    let currentSubSemester = parentCalendarGroup;

    // Detect months, full names, numerical date formats
    const datePattern = /(\b(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(tember)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\b|\b\d{1,2}[\/\.-]\d{1,2})/i;
    // Reject pure time strings
    const timePattern = /^\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)$/i;

    rawRows.forEach(row => {
      const clean = row.map(c => c.trim().replace(/^"|"$/g, ''));
      const col0 = clean[0] || '';
      const col1 = clean[1] || '';
      const col2 = clean[2] || '';
      const col3 = clean[3] || '';

      if (!col0 && !col1 && !col2 && !col3) return;

      // -------------------------------------------------------------
      // LOGIC FOR ACADEMIC CALENDAR YEARS (2026-2027, 2027-2028)
      // -------------------------------------------------------------
      if (isMultiSemester) {
        const fullRowText = `${col0} ${col1} ${col2} ${col3}`.trim();

        // 1. Detect semester or session headers:
        // Matches "Fall 2027", "Summer 2027", "Session I", "Session II", "Summer Session 1", "Session 2", etc.
        const headerMatch = fullRowText.match(/(Fall|Winter|Summer|Spring)\s+\d{4}|(Summer\s+)?Session\s+(I{1,3}|1|2)/i);
        
        // If a row is purely a section header (contains section title without a valid date attached)
        if (headerMatch && !datePattern.test(fullRowText)) {
          // Normalize header name (e.g., convert "Session I" to "Summer Session I" for clarity)
          let matchedTitle = headerMatch[0];
          if (/^Session/i.test(matchedTitle)) {
            matchedTitle = `Summer ${matchedTitle}`;
          }
          currentSubSemester = matchedTitle;
          return; // Skip putting header rows into table data
        }

        if (col0.toLowerCase().includes('click for more dates') || col1.toLowerCase().includes('click for more dates')) return;

        let rawDate = '';
        let rawEvent = '';

        const isCol2Date = col2 && datePattern.test(col2) && !timePattern.test(col2);
        const isCol3Date = col3 && datePattern.test(col3) && !timePattern.test(col3);
        const isCol1Date = col1 && datePattern.test(col1) && !timePattern.test(col1);
        const isCol0Date = col0 && datePattern.test(col0) && !timePattern.test(col0);

        // Column priority check for Summer/Session rows (check Column C / col2 first)
        if (currentSubSemester.toLowerCase().includes('summer') || currentSubSemester.toLowerCase().includes('session')) {
          if (isCol2Date) {
            rawDate = col2;
            rawEvent = col0 || col1;
          } else if (isCol3Date) {
            rawDate = col3;
            rawEvent = col0 || col1;
          } else if (isCol1Date) {
            rawDate = col1;
            rawEvent = col0;
          } else if (isCol0Date) {
            rawDate = col0;
            rawEvent = col1 || col2;
          }
        } else {
          // Standard order for Fall, Winter, Spring
          if (isCol3Date) {
            rawDate = col3;
            rawEvent = col0 || col1 || col2;
          } else if (isCol1Date) {
            rawDate = col1;
            rawEvent = col2 || col0;
          } else if (isCol2Date) {
            rawDate = col2;
            rawEvent = col0 || col1;
          } else if (isCol0Date) {
            rawDate = col0;
            rawEvent = col1 || col2;
          }
        }

        // Fallback for missing/TBD dates
        if (!rawDate) {
          if (col0.toUpperCase() === 'TBD' || col1.toUpperCase() === 'TBD' || col2.toUpperCase() === 'TBD' || col3.toUpperCase() === 'TBD') {
            rawDate = 'TBD';
            rawEvent = col0.toUpperCase() === 'TBD' ? (col1 || col2) : col0;
          } else if (col0 && !timePattern.test(col0) && !/session/i.test(col0)) {
            rawEvent = col0;
            rawDate = 'TBD';
          }
        }

        if (!rawDate && !rawEvent) return;

        // Strip day-of-week abbreviations like "(Mon)", "(Tue)", etc.
        let cleanedDate = rawDate.replace(/\s*\([A-Za-z]{3}\)/gi, '').trim();

        // Extract 4-digit year from parent calendar group or sub-semester
        const yearMatch = (currentSubSemester + ' ' + parentCalendarGroup).match(/\b\d{4}\b/);
        const yearStr = yearMatch ? yearMatch[0] : '';

        // Append year if cleanedDate doesn't already contain a year and is not TBD
        if (cleanedDate && yearStr && !/\b\d{4}\b/.test(cleanedDate) && cleanedDate.toUpperCase() !== 'TBD') {
          cleanedDate = `${cleanedDate}, ${yearStr}`;
        }

        if (cleanedDate || rawEvent) {
          entries.push({
            CalendarGroup: parentCalendarGroup,
            SubSemester: currentSubSemester,
            Term: parentCalendarGroup,
            Date: cleanedDate || 'TBD',
            Event: rawEvent
          });
        }
      } 
      // -------------------------------------------------------------
      // LOGIC FOR SINGLE-TERM SEMESTER DATES (Fall 2026, Winter 2027)
      // -------------------------------------------------------------
      else {
        const termMatch = col0.match(/(Fall|Winter|Summer|Spring)\s+\d{4}/i);
        if (termMatch) {
          currentSubSemester = termMatch[0];
          return;
        }

        if (col0.toLowerCase().includes('click for more dates')) return;

        if (col0 && col1) {
          let singleTermDate = col0.trim();

          const yearMatch = currentSubSemester.match(/\b\d{4}\b/);
          const yearStr = yearMatch ? yearMatch[0] : '';

          if (singleTermDate && yearStr && !/\b\d{4}\b/.test(singleTermDate) && singleTermDate.toUpperCase() !== 'TBD') {
            singleTermDate = `${singleTermDate}, ${yearStr}`;
          }

          entries.push({
            CalendarGroup: parentCalendarGroup,
            SubSemester: currentSubSemester,
            Term: parentCalendarGroup,
            Date: singleTermDate,
            Event: col1
          });
        }
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
      const clean = row.map(c => c.trim().replace(/^"|"$/g, ''));
      if (clean.every(c => c === '')) return;

      const firstCell = clean[0] || '';

      if (firstCell.toLowerCase().includes('additional information')) {
        title = firstCell;
      } else if (firstCell.toLowerCase().startsWith('session')) {
        headers = clean.map((h, i) => h !== '' ? h : (DEFAULT_HEADERS[i] || `Col ${i + 1}`));
      } else if (
        /^[a-z0-9]\s*[-–]/i.test(firstCell) || 
        firstCell.toLowerCase().includes('term') || 
        firstCell.toLowerCase().includes('half') || 
        firstCell.toLowerCase().includes('competency')
      ) {
        sessionRows.push(clean);
      } else if (firstCell) {
        footnotes.push(firstCell);
      }
    });

    if (headers.length === 0) headers = DEFAULT_HEADERS;
    if (!title) title = 'Additional Information';

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
    const activeSheetConfig = SHEETS.find(s => s.term === activeTerm);

    if (activeSheetConfig && activeSheetConfig.isMultiSemester) {
      renderSemesterSubTabs(activeTerm);
    } else if (activeSheetConfig && activeSheetConfig.matrixUrl && activeTerm !== 'All') {
      renderMatrixViewSwitcher();
    } else {
      if (viewSwitcher) viewSwitcher.style.display = 'none';
    }

    if (activeView === 'list') {
      searchControls.style.display = 'block';
      renderListView();
    } else {
      searchControls.style.display = 'none';
      renderMatrixView();
    }
  }

  function renderSemesterSubTabs(calendarGroup) {
    if (!viewSwitcher) return;

    const subSemesters = Array.from(
      new Set(
        calendarData.dates
          .filter(d => d.CalendarGroup === calendarGroup)
          .map(d => d.SubSemester)
      )
    ).filter(Boolean);

    if (subSemesters.length <= 1) {
      viewSwitcher.style.display = 'none';
      return;
    }

    let buttonsHtml = `<button class="view-btn ${activeSubSemester === 'All' ? 'active' : ''}" data-subsemester="All">All Semesters</button>`;
    
    subSemesters.forEach(sub => {
      buttonsHtml += `<button class="view-btn ${activeSubSemester === sub ? 'active' : ''}" data-subsemester="${sub}">${sub}</button>`;
    });

    viewSwitcher.innerHTML = buttonsHtml;
    viewSwitcher.style.display = 'flex';
  }

  function renderMatrixViewSwitcher() {
    if (!viewSwitcher) return;

    viewSwitcher.innerHTML = `
      <button class="view-btn ${activeView === 'list' ? 'active' : ''}" data-view="list">Important Dates</button>
      <button class="view-btn ${activeView === 'matrix' ? 'active' : ''}" data-view="matrix">Additional Info</button>
    `;
    viewSwitcher.style.display = 'flex';
  }

  function renderListView() {
    const query = searchInput.value.toLowerCase().trim();

    const filtered = calendarData.dates.filter(item => {
      const matchTerm = activeTerm === 'All' || item.CalendarGroup.toLowerCase() === activeTerm.toLowerCase();
      const matchSubSemester = activeSubSemester === 'All' || item.SubSemester.toLowerCase() === activeSubSemester.toLowerCase();
      const matchSearch = !query || 
        item.Date.toLowerCase().includes(query) || 
        item.Event.toLowerCase().includes(query) ||
        item.SubSemester.toLowerCase().includes(query);

      return matchTerm && matchSubSemester && matchSearch;
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

    matrix.headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += `</tr></thead><tbody>`;

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

  tabContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-link')) {
      document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      activeTerm = e.target.getAttribute('data-term');

      activeSubSemester = 'All';
      activeView = 'list';

      renderView();
    }
  });

  if (viewSwitcher) {
    viewSwitcher.addEventListener('click', (e) => {
      if (e.target.classList.contains('view-btn')) {
        const subSemesterAttr = e.target.getAttribute('data-subsemester');
        const viewAttr = e.target.getAttribute('data-view');

        if (subSemesterAttr !== null) {
          activeSubSemester = subSemesterAttr;
          activeView = 'list';
        } else if (viewAttr !== null) {
          activeView = viewAttr;
        }

        renderView();
      }
    });
  }

  searchInput.addEventListener('input', renderView);
});