const MS_PER_DAY = 86400000;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function lastDayOfMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}

function nextPaycheckDates(lastPayDate, frequency, fromDate, toDate) {
  const last = parseDate(lastPayDate);
  if (!last) return [];
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (!from || !to || from >= to) return [];

  if (frequency === 'weekly' || frequency === 'bi-weekly') {
    const intervalDays = frequency === 'weekly' ? 7 : 14;
    const intervalMs = intervalDays * MS_PER_DAY;
    let d = new Date(last);
    while (d.getTime() < from.getTime()) {
      d = new Date(d.getTime() + intervalMs);
    }
    while (d.getTime() - intervalMs >= from.getTime()) {
      d = new Date(d.getTime() - intervalMs);
    }
    const dates = [];
    while (d.getTime() < to.getTime()) {
      if (d.getTime() >= from.getTime()) dates.push(new Date(d));
      d = new Date(d.getTime() + intervalMs);
    }
    return dates;
  }

  if (frequency === 'monthly') {
    const anchorDay = last.getDate();
    const dates = [];
    let y = from.getFullYear();
    let m = from.getMonth();
    while (true) {
      const d = new Date(y, m, Math.min(anchorDay, lastDayOfMonth(y, m)));
      if (d.getTime() >= to.getTime()) break;
      if (d.getTime() >= from.getTime()) dates.push(d);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return dates;
  }

  if (frequency === 'semi-monthly') {
    const anchor1 = last.getDate();
    const dates = [];
    let y = from.getFullYear();
    let m = from.getMonth();
    let safety = 0;
    while (safety++ < 600) {
      const lastDay = lastDayOfMonth(y, m);
      const day1 = Math.min(anchor1, lastDay);
      const day2Raw = anchor1 + 15;
      const day2 = Math.min(day2Raw, lastDay);
      const candidates = [new Date(y, m, day1)];
      if (day2 !== day1) candidates.push(new Date(y, m, day2));
      let allPastTo = true;
      for (const d of candidates) {
        if (d.getTime() < to.getTime()) allPastTo = false;
        if (d.getTime() >= from.getTime() && d.getTime() < to.getTime()) {
          dates.push(d);
        }
      }
      if (allPastTo) break;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return dates;
  }

  return [];
}

function paychecksInMonth(lastPayDate, frequency, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return nextPaycheckDates(lastPayDate, frequency, start, end).length;
}

module.exports = {
  nextPaycheckDates,
  paychecksInMonth,
};
