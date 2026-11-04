/* GOAT words: keeps the Categories tab in step with the category tabs.
   Paste into Extensions > Apps Script in the workbook, save, then run syncCategories once to approve it.
   It runs again each time the workbook opens. */
function onOpen() {
  syncCategories();
}

function syncCategories() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cat = ss.getSheetByName('Categories');
  const skip = ['Categories', 'Template'];
  const tabs = ss.getSheets().filter(s => !skip.includes(s.getName()));

  // Keep each category's settings (columns B to G), matched by category name, so they survive reordering.
  const saved = {};
  const lastRow = cat.getLastRow();
  if (lastRow > 1) {
    cat.getRange(2, 1, lastRow - 1, 7).getValues().forEach(r => {
      if (r[0]) saved[r[0]] = r.slice(1, 7);
    });
  }

  // Clear the automatic columns, then rewrite them from the tabs.
  cat.getRange(2, 1, Math.max(lastRow - 1, 1), 10).clearContent();
  tabs.forEach((s, i) => {
    const row = i + 2;
    const name = s.getName();
    cat.getRange(row, 1).setValue(name);
    cat.getRange(row, 2, 1, 6).setValues([saved[name] || ['', '', '', '', '', '']]);
    cat.getRange(row, 8).setFormula('=COUNTIF(INDIRECT("\'"&A' + row + '&"\'!B:B"),"TRUE")');
    cat.getRange(row, 9).setValue(s.getSheetId());
    cat.getRange(row, 10).setFormula('=IF(H' + row + '<2,"needs 2+ visible words","ok")');
  });
}
