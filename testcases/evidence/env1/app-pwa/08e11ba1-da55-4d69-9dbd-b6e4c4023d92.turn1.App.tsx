import { useState, useEffect } from "react";
import { Trash2, WifiOff } from "lucide-react";

interface Note {
  id: string;
  content: string;
  createdAt: number;
}

const STORAGE_KEY = "tiny-notes";

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setNotes(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSave = () => {
    if (!newNote.trim()) return;
    const note: Note = {
      id: crypto.randomUUID(),
      content: newNote.trim(),
      createdAt: Date.now(),
    };
    setNotes((prev) => [note, ...prev]);
    setNewNote("");
  };

  const handleDelete = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 text-white px-4 py-2 text-sm font-medium">
          <WifiOff size={16} />
          <span>You're offline — notes are saved locally</span>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">Tiny Notes</h1>

        <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-4 mb-6">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write a note..."
            className="w-full h-24 resize-none rounded-md border border-stone-300 px-3 py-2 text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleSave}
              disabled={!newNote.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-md transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="text-stone-500 text-center py-8">No notes yet. Start typing above!</p>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="bg-white rounded-lg shadow-sm border border-stone-200 p-4 group"
              >
                <p className="text-stone-700 whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-stone-400">
                    {new Date(note.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="text-stone-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete note"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}