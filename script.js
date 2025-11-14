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
// Functions to manage local notes in localStorage
function getLocalNotes() {
  try {
    const s = localStorage.getItem('ssp_notes');
    return s ? JSON.parse(s) : [];
  } catch (e) { return []; }
}
// Function to save notes array to localStorage
function saveLocalNotes(arr) {
  localStorage.setItem('ssp_notes', JSON.stringify(arr));
}
// Function to save a single note object to localStorage
function saveLocalNoteObj(note) {
  const notes = getLocalNotes();
  notes.unshift(note);
  saveLocalNotes(notes);
}
// Function to render notes list
function renderNotesList() {
  const list = $("notesList");
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
  }
  // Attach delete event listeners
  list.querySelectorAll('.note-delete').forEach(del => {
    del.addEventListener('click', (e) => {
      e.stopPropagation();  // prevent note selection
      const id = del.getAttribute('data-id');
      confirmDelete(id, del.closest(".note-item")); // smoother deletion
    });
  });
  statTopics.textContent = notes.length;
}
// Function to select a note
function selectNote(id) {
  const notes = getLocalNotes();
  const note = notes.find(n => n.id === id);
  if (!note) { alert('Note not found'); return; }
  selectedNoteId = id;
  selectedNoteText = note.text || "";
  $("selectedNoteLabel").textContent = note.title;
  appendChat(`Selected note: ${note.title}`, "partner");
  addActivity(`Selected note: ${note.title}`);
}
// Function to confirm and delete a note
function confirmDelete(id, itemEl) {
  const ok = confirm("Are you sure you want to delete this note?");
  if (!ok) return;
  itemEl.classList.add("deleting");
  setTimeout(() => {
    deleteNote(id);
  }, 250);
}
// Function to delete a note
function deleteNote(id) {
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
    saveLocalNoteObj(newNote);
    renderNotesList();
    $("selectedNoteLabel").textContent = title;
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
  ev.target.value = '';
});
// Save note locally and offer download for .txt or .doc
$("btnSaveNote").addEventListener('click', () => {
  const title = $("inputNoteTitle").value.trim() || 'Untitled';
  const text = $("inputNoteText").value.trim();
  if (!text) { alert('Please paste your notes to save'); return; }
  const note = { id: Date.now().toString(), title, text, created_at: new Date().toISOString() };
  saveLocalNoteObj(note);
  renderNotesList();
  addActivity(`Saved note: ${title}`);
  let fmt = prompt("Save file format: 'txt' or 'doc' (Word-compatible). Default: txt", 'txt');
  if (!fmt) fmt = 'txt';
  fmt = fmt.toLowerCase();
  if (fmt !== 'txt' && fmt !== 'doc') fmt = 'txt';
  if (fmt === 'txt') {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^a-z0-9\-\_ ]/ig, '') || 'note'}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } else {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre></body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^a-z0-9\-\_ ]/ig, '') || 'note'}.doc`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
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
// Initial render
renderNotesList();
updateStats();
// Service worker registration
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .catch(err => console.log("Service worker registration failed", err));
}
// End of Program (Program by Zidaan)
