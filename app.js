
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const db = {
  load() {
    try {
      return JSON.parse(localStorage.getItem('tidyhome')) || { rooms: [], people: [], tasks: [], settings: { remindAt: '' }, streak: { lastDay:'', days:0 }, points: 0 };
    } catch(e) {
      return { rooms: [], people: [], tasks: [], settings: { remindAt: '' }, streak: { lastDay:'', days:0 }, points: 0 };
    }
  },
  save(data) {
    localStorage.setItem('tidyhome', JSON.stringify(data));
  }
};

let state = db.load();

function fmtDate(d) {
  return d.toISOString().slice(0,10);
}
function todayStr() {
  const now = new Date();
  return fmtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00');
  d.setDate(d.getDate()+n);
  return fmtDate(d);
}
function diffDays(aStr, bStr) {
  const a = new Date(aStr + 'T00:00');
  const b = new Date(bStr + 'T00:00');
  return Math.round((a-b)/(1000*60*60*24));
}

function frequencyToDays(freq, n=3) {
  switch(freq) {
    case 'daily': return 1;
    case 'weekly': return 7;
    case 'biweekly': return 14;
    case 'monthly': return 30;
    case 'custom': return Math.max(1, Number(n||3));
    default: return 7;
  }
}

function nextDueDate(task) {
  const every = frequencyToDays(task.frequency, task.everyNDays);
  const base = task.lastDone || task.start || todayStr();
  let nd = addDays(base, every);
  // If start is in the future and never done, first due date is start
  if (!task.lastDone && task.start && diffDays(task.start, todayStr()) >= 0) {
    nd = task.start;
  }
  return nd;
}

function statusBadge(task) {
  const t = todayStr();
  const due = task.due || nextDueDate(task);
  const delta = diffDays(due, t) * -1; // negative if future
  if (due < t) return `<span class="pill bad">Overdue ${diffDays(t, due)}d</span>`;
  if (due === t) return `<span class="pill warn">Due today</span>`;
  return `<span class="pill ok">In ${diffDays(due, t)}d</span>`;
}

function renderSelects() {
  const roomSel = $('#taskRoom');
  const personSel = $('#taskPerson');
  roomSel.innerHTML = '<option value="">Room (optional)</option>' + state.rooms.map(r=>`<option value="${r}">${r}</option>`).join('');
  personSel.innerHTML = '<option value="">Assign to (optional)</option>' + state.people.map(p=>`<option value="${p}">${p}</option>`).join('');
}

function renderRooms() {
  $('#roomList').innerHTML = state.rooms.map(r=>`<li class="row" style="justify-content:space-between; margin:6px 0"><span>${r}</span><button class="btn-ghost" data-del-room="${r}">Delete</button></li>`).join('');
}

function renderPeople() {
  $('#peopleList').innerHTML = state.people.map(p=>`<li class="row" style="justify-content:space-between; margin:6px 0"><span>${p}</span><button class="btn-ghost" data-del-person="${p}">Delete</button></li>`).join('');
}

function taskHtml(task) {
  const room = task.room ? `<span class="chip">${task.room}</span>` : '';
  const who = task.person ? `<span class="chip">👤 ${task.person}</span>` : '';
  const due = task.due || nextDueDate(task);
  const cls = due < todayStr() ? 'task overdue' : (due === todayStr() ? 'task due-today' : 'task');
  return `<div class="${cls}" data-id="${task.id}">
    <input type="checkbox" data-done="${task.id}">
    <div>
      <div class="row" style="justify-content:space-between">
        <div class="title">${task.title}</div>
        <div>${statusBadge(task)}</div>
      </div>
      <div class="row meta">
        <span>Every ${frequencyToDays(task.frequency, task.everyNDays)}d</span>
        <span>•</span>
        <span>Next: ${due}</span>
        ${room} ${who}
      </div>
    </div>
    <div class="row">
      <button class="btn-ghost" data-edit="${task.id}">Edit</button>
      <button class="btn-ghost" data-delete="${task.id}">Delete</button>
    </div>
  </div>`;
}

function renderLists() {
  const t = todayStr();
  state.tasks.forEach(task => task.due = nextDueDate(task)); // update computed
  const today = state.tasks.filter(task => task.due <= t);
  const upcoming = state.tasks.filter(task => task.due > t).sort((a,b)=> a.due.localeCompare(b.due)).slice(0, 10);
  const all = state.tasks.slice().sort((a,b)=> a.due.localeCompare(b.due));

  $('#todayList').innerHTML = today.map(taskHtml).join('');
  $('#upcomingList').innerHTML = upcoming.map(taskHtml).join('');
  $('#allList').innerHTML = all.map(taskHtml).join('');

  $('#todayEmpty').classList.toggle('hidden', today.length !== 0);
  $('#upcomingEmpty').classList.toggle('hidden', upcoming.length !== 0);
  $('#allEmpty').classList.toggle('hidden', all.length !== 0);
  updateStreakBadge();
}

function updateStreakBadge() {
  $('#streakBadge').textContent = `Streak: ${state.streak.days} day${state.streak.days===1?'':'s'}`;
}

function completeTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.lastDone = todayStr();
  task.due = nextDueDate(task);
  state.points += 1;
  // update streak
  const t = todayStr();
  if (state.streak.lastDay === '') {
    state.streak.lastDay = t;
    state.streak.days = 1;
  } else {
    const gap = Math.abs(diffDays(t, state.streak.lastDay));
    if (gap === 0) {
      // already did one today, keep streak
    } else if (gap === 1) {
      state.streak.days += 1;
      state.streak.lastDay = t;
    } else {
      state.streak.days = 1;
      state.streak.lastDay = t;
    }
  }
  saveAndRender();
  maybeNotify('Nice! ✅', `Completed: ${task.title}`);
}

function editTask(id) {
  const t = state.tasks.find(t=>t.id===id);
  if (!t) return;
  const title = prompt('Task title', t.title) ?? t.title;
  const room = prompt('Room (optional)', t.room || '') ?? t.room;
  const person = prompt('Assign to (optional)', t.person || '') ?? t.person;
  const freq = prompt('Frequency: daily, weekly, biweekly, monthly, custom', t.frequency) ?? t.frequency;
  let every = t.everyNDays || 3;
  if (freq === 'custom') {
    every = Number(prompt('Every how many days?', String(every)) || every);
  }
  const start = prompt('Start date (YYYY-MM-DD)', t.start || '') ?? t.start;
  Object.assign(t, { title, room, person, frequency: freq, everyNDays: every, start });
  saveAndRender();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveAndRender();
}

function saveAndRender() {
  db.save(state);
  renderSelects();
  renderRooms();
  renderPeople();
  renderLists();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tidyhome-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state = data;
      saveAndRender();
    } catch(e) {
      alert('Invalid JSON');
    }
  };
  reader.readAsText(file);
}

function randomExamples() {
  const examples = [
    { title: 'Quick tidy – living room', room:'Living Room', frequency: 'daily', start: todayStr() },
    { title: 'Wipe kitchen counters', room:'Kitchen', frequency: 'daily', start: todayStr() },
    { title: 'Vacuum main floor', room:'Hallway', frequency: 'weekly', start: todayStr() },
    { title: 'Bathrooms – sinks & mirrors', room:'Bathroom', frequency: 'weekly', start: todayStr() },
    { title: 'Change bed sheets', room:'Bedroom', frequency: 'biweekly', start: todayStr() },
    { title: 'Deep clean fridge', room:'Kitchen', frequency: 'monthly', start: todayStr() }
  ];
  examples.forEach((e,i)=> state.tasks.push({ id: crypto.randomUUID(), ...e }));
}

function maybeNotify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'icon-192.png' });
  }
}

function scheduleDailyReminder() {
  const at = state.settings.remindAt;
  if (!at) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const [hh, mm] = at.split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= now) next.setDate(next.getDate()+1);
  const delay = next - now;
  setTimeout(()=>{
    const dueCount = state.tasks.filter(t => (t.due||nextDueDate(t)) <= todayStr()).length;
    maybeNotify('TidyHome – Reminder', `${dueCount} task${dueCount===1?'':'s'} need attention today.`);
    // chain another reminder
    scheduleDailyReminder();
  }, delay);
}

function initEvents() {
  $('#addRoom').addEventListener('click', ()=>{
    const name = $('#roomName').value.trim();
    if (!name) return;
    if (!state.rooms.includes(name)) state.rooms.push(name);
    $('#roomName').value='';
    saveAndRender();
  });

  $('#addPerson').addEventListener('click', ()=>{
    const name = $('#personName').value.trim();
    if (!name) return;
    if (!state.people.includes(name)) state.people.push(name);
    $('#personName').value='';
    saveAndRender();
  });

  $('#taskFrequency').addEventListener('change', (e)=>{
    $('#taskEveryNDays').classList.toggle('hidden', e.target.value !== 'custom');
  });

  $('#createTask').addEventListener('click', ()=>{
    const title = $('#taskTitle').value.trim();
    if (!title) return alert('Please enter a task title');
    const room = $('#taskRoom').value || '';
    const person = $('#taskPerson').value || '';
    const frequency = $('#taskFrequency').value;
    const everyNDays = Number($('#taskEveryNDays').value || 3);
    const start = $('#taskStart').value || todayStr();
    state.tasks.push({ id: crypto.randomUUID(), title, room, person, frequency, everyNDays, start, lastDone: '' });
    $('#taskTitle').value=''; $('#taskStart').value='';
    saveAndRender();
  });

  $('#addQuick').addEventListener('click', ()=>{
    randomExamples();
    saveAndRender();
  });

  $('#exportData').addEventListener('click', exportData);

  // Delegate actions
  document.body.addEventListener('click', (e)=>{
    const delRoom = e.target.getAttribute('data-del-room');
    if (delRoom) {
      state.rooms = state.rooms.filter(r=>r!==delRoom);
      state.tasks.forEach(t=>{ if (t.room === delRoom) t.room=''; });
      saveAndRender();
    }
    const delPerson = e.target.getAttribute('data-del-person');
    if (delPerson) {
      state.people = state.people.filter(p=>p!==delPerson);
      state.tasks.forEach(t=>{ if (t.person === delPerson) t.person=''; });
      saveAndRender();
    }
    const done = e.target.getAttribute('data-done');
    if (done) completeTask(done);
    const edit = e.target.getAttribute('data-edit');
    if (edit) editTask(edit);
    const del = e.target.getAttribute('data-delete');
    if (del) {
      if (confirm('Delete this task?')) deleteTask(del);
    }
  });

  // Tabs (very lightweight; we just scroll)
  $$('.tabbar button').forEach(btn => btn.addEventListener('click', ()=>{
    const tab = btn.getAttribute('data-tab');
    if (tab === 'today') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tab === 'upcoming') $('#upcomingList').scrollIntoView({ behavior: 'smooth' });
    if (tab === 'tasks') $('#allList').scrollIntoView({ behavior: 'smooth' });
    if (tab === 'settings') alert('Settings live in the header and New Task card for now 🙂');
  }));

  // Reminder time
  $('#remindAt').addEventListener('change', (e)=>{
    state.settings.remindAt = e.target.value;
    db.save(state);
    if ('Notification' in window) Notification.requestPermission().then(()=> scheduleDailyReminder());
  });
}

function init() {
  renderSelects();
  renderRooms();
  renderPeople();
  renderLists();
  $('#remindAt').value = state.settings.remindAt || '';
  initEvents();
  if ('Notification' in window && state.settings.remindAt) {
    Notification.requestPermission().then(()=> scheduleDailyReminder());
  }
}

init();
