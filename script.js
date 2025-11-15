// script.js

// Elements helper
const $ = id => document.getElementById(id);
const chatArea = $("chatArea");
const activityList = $("activityList");
const statFocus = $("statFocus");
const statTopics = $("statTopics");
// Local state
let selectedNoteId = null;
let selectedNoteText = "";
let interactionsCount = 0;
// Supabase configuration
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"; // <- replace
const SUPABASE_ANON_KEY = "YOUR-ANON-KEY"; // <- replace
// runtime supabase client (will be set after the library loads)
let supabaseClient = null;
let supabaseReady = false;
// Function to load Supabase SDK dynamically
function loadSupabaseSdk() {
  return new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      supabaseReady = true;
      return resolve();
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js";
    s.onload = () => {
      try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseReady = true;
        resolve();
      } catch (err) {
        console.warn("Supabase init failed", err);
        supabaseReady = false;
        resolve(); // resolve anyway, we'll fallback to localStorage
      }
    };
    s.onerror = (e) => {
      console.warn("Failed to load supabase sdk", e);
      supabaseReady = false;
      resolve(); // resolve so UI still works with localStorage fallback
    };
    document.head.appendChild(s);
  });
}
// Function to append chat messages
function appendChat(text, who = "partner") {
  const el = document.createElement("div");
  el.className = "bubble " + (who === "me" ? "me" : "partner");
  el.innerHTML = text
  .replace(/\n\n/g, "<br><br>")
  .replace(/\n/g, "<br>");
  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
}
// Theme toggle visuals for day/night mode
const dayNightToggle = $("dayNightToggle");
const fakeDot = $("fakeDot");
const modeText = $("modeText");
// Function to apply day/night mode
function applyMode(checked) {
  if (checked) {
    document.body.classList.remove("light");
    fakeDot.style.transform = "translateX(0)";
    modeText.textContent = "🌙 Night";
  } else {
    document.body.classList.add("light");
    fakeDot.style.transform = "translateX(20px)";
    modeText.textContent = "🌞 Day";
  }
}
dayNightToggle.checked = true;
applyMode(true);
// Event listener for day/night mode toggle
document.querySelector('.mode-switch').addEventListener('click', () => {
  dayNightToggle.checked = !dayNightToggle.checked;
  applyMode(dayNightToggle.checked);
});
// Initial hint
appendChat("Welcome — paste notes and ask 'Give me a summary' to start.", "partner");
// Local notes management
function getLocalNotes() {
  try {
    const s = localStorage.getItem('ssp_notes');
    return s ? JSON.parse(s) : [];
  } catch (e) { return []; }
}
// Save notes array locally
function saveLocalNotes(arr) {
  localStorage.setItem('ssp_notes', JSON.stringify(arr));
}
// Save a single note object locally
function saveLocalNoteObj(note) {
  const notes = getLocalNotes();
  notes.unshift(note);
  saveLocalNotes(notes);
}
//My supabase cloud functions
async function saveNoteToCloud(note) {
  // note: { id, title, text, created_at }
  if (!supabaseReady || !supabaseClient) return { ok: false, error: "supabase-not-ready" };
  try {
    const { data, error } = await supabaseClient
      .from('notes')
      .insert([{ title: note.title, content: note.text, created_at: note.created_at }])
      .select()
      .limit(1);
    if (error) return { ok: false, error };
    if (data && data.length) {
      // update local note id to cloud id for future deletes/edits
      return { ok: true, row: data[0] };
    } else {
      return { ok: false, error: "no-data-returned" };
    }
  } catch (err) {
    return { ok: false, error: err };
  }
}
// Function to get notes from cloud
async function getNotesFromCloud() {
  if (!supabaseReady || !supabaseClient) return { ok: false, error: "supabase-not-ready" };
  try {
    const { data, error } = await supabaseClient
      .from('notes')
      .select('id,title,content,created_at')
      .order('created_at', { ascending: false });
    if (error) return { ok: false, error };
    return { ok: true, rows: data };
  } catch (err) {
    return { ok: false, error: err };
  }
}
// Function to delete a note from cloud
async function deleteNoteFromCloud(cloudId) {
  if (!supabaseReady || !supabaseClient) return { ok: false, error: "supabase-not-ready" };
  try {
    const { data, error } = await supabaseClient
      .from('notes')
      .delete()
      .eq('id', cloudId);
    if (error) return { ok: false, error };
    return { ok: true, rows: data };
  } catch (err) {
    return { ok: false, error: err };
  }
}
// Function to render notes list (cloud first, then local)
function renderNotesList() {
  const list = $("notesList");
  list.innerHTML = "";
  // Attempt to use cloud notes first if supabase is initialized
  if (supabaseReady) {
    getNotesFromCloud().then(res => {
      if (res.ok && Array.isArray(res.rows) && res.rows.length) {
        // convert cloud rows to the same shape as local notes for rendering
        const cloudNotes = res.rows.map(r => ({
          id: r.id,
          title: r.title || 'Untitled',
          text: r.content || '',
          created_at: r.created_at || new Date().toISOString()
        }));
        // render cloud notes
        cloudNotes.forEach(n => {
          const div = document.createElement('div');
          div.className = 'note-item';
          div.tabIndex = 0;
          div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; width:100%;">
              <strong>${n.title}</strong>
              <span class="note-delete" data-id="${n.id}">×</span>
            </div>
            <div class="muted small">${new Date(n.created_at).toLocaleString()}</div>
          `;
          div.addEventListener('click', () => selectNote(n.id));
          list.appendChild(div);
        });
        // Attach delete listeners
        list.querySelectorAll('.note-delete').forEach(del => {
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = del.getAttribute('data-id');
            confirmDelete(id, del.closest(".note-item"), { cloud: true });
          });
        });
        statTopics.textContent = cloudNotes.length;
      } else {
        // fallback to localStorage if cloud empty or error
        renderLocalNotes(list);
      }
    }).catch(() => {
      renderLocalNotes(list);
    });
  } else {
    renderLocalNotes(list);
  }
}
// Function to render local notes only
function renderLocalNotes(listEl = null) {
  const list = listEl || $("notesList");
  const notes = getLocalNotes();
  list.innerHTML = "";
  if (!notes.length) {
    list.innerHTML = '<div class="muted small">No notes yet — save your first note</div>';
  } else {
    notes.forEach(n => {
      const div = document.createElement('div');
      div.className = 'note-item';
      div.tabIndex = 0;
      div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; width:100%;">
          <strong>${n.title}</strong>
          <span class="note-delete" data-id="${n.id}">×</span>
        </div>
        <div class="muted small">${new Date(n.created_at).toLocaleString()}</div>
      `;
      div.addEventListener('click', () => selectNote(n.id));
      list.appendChild(div);
    });
    // Attach delete event listeners
    list.querySelectorAll('.note-delete').forEach(del => {
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = del.getAttribute('data-id');
        confirmDelete(id, del.closest(".note-item"), { cloud: false });
      });
    });
  }
  statTopics.textContent = getLocalNotes().length;
}
// Function to select a note
function selectNote(id) {
  // Try to find locally first
  const localNotes = getLocalNotes();
  let note = localNotes.find(n => n.id === id);
  if (!note && supabaseReady) {
    // try cloud fetch
    // fetch single note from cloud
    (async () => {
      try {
        const { data, error } = await supabaseClient.from('notes').select('id,title,content,created_at').eq('id', id).limit(1);
        if (!error && data && data.length) {
          note = { id: data[0].id, title: data[0].title, text: data[0].content, created_at: data[0].created_at };
          selectedNoteId = id;
          selectedNoteText = note.text || "";
          $("selectedNoteLabel").textContent = note.title;
          appendChat(`Selected note: ${note.title}`, "partner");
          addActivity(`Selected note: ${note.title}`);
        } else {
          if (!note) { alert('Note not found'); }
        }
      } catch (err) {
        if (!note) { alert('Note not found'); }
      }
    })();
    return;
  }
  if (!note) { alert('Note not found'); return; }
  selectedNoteId = id;
  selectedNoteText = note.text || "";
  $("selectedNoteLabel").textContent = note.title;
  appendChat(`Selected note: ${note.title}`, "partner");
  addActivity(`Selected note: ${note.title}`);
}
// Function to confirm and delete a note
function confirmDelete(id, itemEl, opts = { cloud: false }) {
  const ok = confirm("Are you sure you want to delete this note?");
  if (!ok) return;
  itemEl.classList.add("deleting");
  setTimeout(async () => {
    if (opts.cloud && supabaseReady) {
      // delete from cloud
      const res = await deleteNoteFromCloud(id);
      if (res.ok) {
        // remove any local copy that matches this cloud id if present
        let notes = getLocalNotes();
        notes = notes.filter(n => n.id !== id);
        saveLocalNotes(notes);
        renderNotesList();
        appendChat("Note deleted.", "partner");
        addActivity("Deleted a note");
      } else {
        alert("Failed to delete from cloud. Deleting locally instead.");
        deleteNoteLocal(id);
      }
    } else {
      deleteNoteLocal(id);
    }
  }, 250);
}
// Function to delete a note locally
function deleteNoteLocal(id) {
  let notes = getLocalNotes();
  notes = notes.filter(n => n.id !== id);
  saveLocalNotes(notes);
  renderNotesList();
  appendChat("Note deleted.", "partner");
  addActivity("Deleted a note");
}
// File picker for loading notes
$("btnPickNote").addEventListener('click', () => { $("filePicker").click(); });
$("filePicker").addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const name = f.name || 'picked-file';
  const ext = name.split('.').pop().toLowerCase();
  async function finalizeLoadedNote(title, text) {
    $("inputNoteTitle").value = title;
    $("inputNoteText").value = text;
    selectedNoteText = text;
    const newNote = {
      id: Date.now().toString(),
      title,
      text,
      created_at: new Date().toISOString()
    };
    // Save locally first
    saveLocalNoteObj(newNote);
    renderNotesList();
    $("selectedNoteLabel").textContent = title;
    // Try to save to cloud in background (hybrid approach)
    if (supabaseReady) {
      const cloudRes = await saveNoteToCloud(newNote);
      if (cloudRes.ok && cloudRes.row && cloudRes.row.id) {
        // Replace local note id with cloud id for future operations
        let notes = getLocalNotes();
        notes = notes.map(n => {
          if (n.id === newNote.id) {
            return { ...n, id: cloudRes.row.id };
          }
          return n;
        });
        saveLocalNotes(notes);
        renderNotesList();
        addActivity(`Saved note to cloud: ${title}`);
      } else {
        // keep local only and notify
        addActivity(`Saved locally (cloud failed): ${title}`);
      }
    } else {
      addActivity(`Saved locally: ${title}`);
    }
  }
  if (ext === 'txt' || ext === 'md') {
    const text = await f.text();
    await finalizeLoadedNote(name.replace(/\.[^/.]+$/, ""), text);
    addActivity(`Loaded text from ${name}`);
  } else if (['png','jpg','jpeg','gif','bmp','webp'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement('img');
      img.src = reader.result;
      img.style.maxWidth = '100%';
      img.style.margin = '8px 0';
      chatArea.appendChild(img);
      chatArea.scrollTop = chatArea.scrollHeight;
      finalizeLoadedNote(name.replace(/\.[^/.]+$/, ""), `[Image attached: ${name}]`);
      addActivity(`Loaded image ${name}`);
    };
    reader.readAsDataURL(f);
  } else if (ext === "pdf") {
    const fileReader = new FileReader();
    fileReader.onload = async function () {
      try {
        const typedarray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let textContent = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const txt = await page.getTextContent();
          textContent += txt.items.map(i => i.str).join(" ") + "\n";
        }
        await finalizeLoadedNote(name.replace(/\.[^/.]+$/, ""), textContent);
        addActivity(`Loaded text from ${name}`);
      } catch (err) {
        console.error("PDF parsing error", err);
        alert("Failed to extract text from PDF");
        addActivity(`PDF text extraction failed: ${name}`);
      }
    };
    fileReader.readAsArrayBuffer(f);
  } else {
    alert('This file type is not supported for automatic text extraction yet. You can open it locally and copy-paste the text into the editor.');
    addActivity(`Picked unsupported file: ${name}`);
  }
  // reset input so same file can be picked again
  ev.target.value = '';
});
// Save note locally and offer download for .txt or .doc
$("btnSaveNote").addEventListener('click', async () => {
  const title = $("inputNoteTitle").value.trim() || 'Untitled';
  const text = $("inputNoteText").value.trim();
  if (!text) { alert('Please paste your notes to save'); return; }
  const note = { id: Date.now().toString(), title, text, created_at: new Date().toISOString() };
  saveLocalNoteObj(note);
  renderNotesList();
  addActivity(`Saved note: ${title}`);
  // Try to save to cloud as well (background)
  if (supabaseReady) {
    const cloudRes = await saveNoteToCloud(note);
    if (cloudRes.ok && cloudRes.row && cloudRes.row.id) {
      // update local id -> cloud id
      let notes = getLocalNotes();
      notes = notes.map(n => (n.id === note.id ? { ...n, id: cloudRes.row.id } : n));
      saveLocalNotes(notes);
      renderNotesList();
      addActivity(`Saved note to cloud: ${title}`);
    } else {
      addActivity(`Cloud save failed for: ${title}`);
    }
  } else {
    addActivity(`Saved locally: ${title}`);
  }
  // Ask user for download format (txt or doc)
  let fmt = prompt("Save file format: 'txt' or 'doc' (Word-compatible). Default: txt", 'txt');
  if (!fmt) fmt = 'txt';
  fmt = fmt.toLowerCase();
  if (fmt !== 'txt' && fmt !== 'doc') fmt = 'txt';
  // Download the file 
  if (fmt === 'txt') {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^a-z0-9\-\_ ]/ig, '') || 'note'}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } else {
    // create a simple Word-compatible HTML file (.doc)
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre></body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^a-z0-9\-\_ ]/ig, '') || 'note'}.doc`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  // clear inputs after save
  $("inputNoteTitle").value = '';
  $("inputNoteText").value = '';
});
// Function to escape HTML special characters
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Clear note
$("btnClearNote").addEventListener('click', () => { $("inputNoteTitle").value = ''; $("inputNoteText").value = ''; });
// Export all local notes as JSON
$("btnExport").addEventListener('click', () => {
  const notes = getLocalNotes();
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'my-notes.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  addActivity('Exported local notes');
});
// Quick quiz generation
$("btnQuickQuiz").addEventListener('click', async () => {
  if (!selectedNoteText.trim()) {
    alert("Select or load a note first");
    return;
  }
  appendChat("Generating your personalized quiz… 🔄", "partner");
  try {
    const response = await fetch("https://smart-study-partner.onrender.com/chat/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteText: selectedNoteText
      })
    });
    const data = await response.json();
    appendChat(data.quiz, "partner");
    addActivity("Generated AI-based quiz");
  } catch (err) {
    console.error("Quiz API error:", err);
    appendChat("Sorry, I couldn't generate the quiz due to a server problem.", "partner");
  }
});
// Chat send (with backend API)
$("btnSendMessage").addEventListener('click', async () => {
  const txt = $("inputMessage").value.trim();
  if (!txt) return;
  appendChat(txt, 'me');
  $("inputMessage").value = '';
  try {
    const response = await fetch('https://smart-study-partner.onrender.com/chat/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: txt,
        noteText: selectedNoteText
      })
    });
    const data = await response.json();
    appendChat(data.reply, 'partner');
    addActivity('Asked: ' + txt);
  } catch (error) {
    console.error('API Error:', error);
    appendChat('Sorry, there was an error connecting to the server. Please try again.', 'partner');
    addActivity('Error: Failed to get response');
  }
});
// Function to add activity log entry
function addActivity(text) {
  const li = document.createElement('li');
  li.className = 'small';
  li.textContent = new Date().toLocaleTimeString() + ' — ' + text;
  if (activityList.children && activityList.children.length && activityList.children[0].classList.contains('muted')) activityList.innerHTML = '';
  activityList.prepend(li);
  interactionsCount += 1;
  updateStats();
}
// Function to update stats
function updateStats() {
  const focus = Math.min(99, Math.round(interactionsCount === 0 ? 0 : 35 + interactionsCount * 5));
  statFocus.textContent = `${focus}%`;
}
// Keyboard shortcut send (Ctrl/Cmd + Enter)
$("inputMessage").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("btnSendMessage").click(); }
});
// Safety net for promises
window.addEventListener('unhandledrejection', (ev) => { console.warn('Unhandled promise rejection', ev.reason); });
// Initial render and supabase load
(async function init() {
  await loadSupabaseSdk();
  renderNotesList();
  updateStats();
})();
// Service worker registration
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .catch(err => console.log("Service worker registration failed", err));
}
// End of Program (Program by Zidaan)
