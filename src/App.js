// src/App.js
import React, { useEffect, useState } from "react";
import "./App.css";
import Auth from "./Auth";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

/* ---------------- Icons ---------------- */
const HomeIcon = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M3 10.5L12 4l9 6.5V20a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2v-9.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
  </svg>
);
const UsersIcon = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M16 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M21 21v-1.2a3.6 3.6 0 0 0-3-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M17.5 4.8a2.8 2.8 0 1 1 0 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const UserIcon = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M4 20a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
  </svg>
);
const LogoutIcon = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

/* -------- Helpers -------- */
const deriveNameFromUser = (u) => {
  if (!u) return "You";
  if (u.displayName && u.displayName.trim()) return u.displayName.trim();
  const raw = (u.email || "you").split("@")[0];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

async function ensureUserDoc(user) {
  if (!user) return;
  const uref = doc(db, "users", user.uid);
  const snap = await getDoc(uref);
  if (!snap.exists()) {
    const guess = (user.email || "user").split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase();
    await setDoc(uref, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      username: guess,
      createdAt: serverTimestamp(),
    });
  }
}

/* ---------- Reusable Updates+Comments block (memoized) ---------- */
const EditUpdates = React.memo(function EditUpdates({
  personId,
  updates = [],
  commentDrafts,
  setCommentDrafts,
  addUpdateToPerson,
  addCommentToUpdate,
}) {
  return (
    <>
      <hr style={{ borderColor: "rgba(255,255,255,0.12)", margin: "10px 0" }} />
      <div className="h4" style={{ marginBottom: 6 }}>Updates</div>

      {/* Add new update */}
      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
        <textarea
          className="input"
          rows={2}
          placeholder="Write a quick update..."
          value={commentDrafts[`__new_${personId}`] || ""}
          onChange={(e) =>
            setCommentDrafts((d) => ({ ...d, [`__new_${personId}`]: e.target.value }))
          }
        />
        <button
          className="btn primary"
          onClick={async () => {
            const text = (commentDrafts[`__new_${personId}`] || "").trim();
            if (!text) return;
            await addUpdateToPerson(personId, text);
            setCommentDrafts((d) => {
              const { [`__new_${personId}`]: _, ...rest } = d;
              return rest;
            });
          }}
        >
          Add Update
        </button>
      </div>

      {/* Past updates + comments */}
      {updates.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 8,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {updates.map((u) => {
            const draftKey = `${personId}_${u.id}`;
            const draft = commentDrafts[draftKey] || "";
            return (
              <li key={u.id} className="glass" style={{ padding: 8, borderRadius: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>
                  {u.ts?.toDate ? u.ts.toDate().toLocaleString() : "just now"}
                </div>
                <div style={{ fontSize: 14, marginBottom: 6 }}>{u.text}</div>

                {/* existing comments */}
                {u.comments?.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "6px 0", display: "grid", gap: 6 }}>
                    {u.comments.map((c) => (
                      <li key={c.id} className="glass" style={{ padding: 6, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>
                          {c.ts?.toDate ? c.ts.toDate().toLocaleString() : "just now"}
                        </div>
                        <div style={{ fontSize: 13 }}>{c.text}</div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* add a comment */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                  <input
                    className="input"
                    placeholder="Write a comment…"
                    value={draft}
                    onChange={(e) =>
                      setCommentDrafts((d) => ({ ...d, [draftKey]: e.target.value }))
                    }
                  />
                  <button
                    className="btn xs primary"
                    onClick={() => addCommentToUpdate(personId, u.id, draft)}
                    disabled={!draft.trim()}
                  >
                    Comment
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="subtle">No updates yet.</div>
      )}
    </>
  );
});

/* --------------- Home Radar (hearts on sweep) ----------------- */
function Radar({ size = 300 }) {
  const [sweep, setSweep] = useState(0);
  const [targets, setTargets] = useState(() => {
    const make = () => {
      const radius = Math.random() * (size / 2 - 22);
      const theta = Math.random() * 360;
      return { r: radius, theta };
    };
    return Array.from({ length: 14 }, make);
  });

  const fanDeg = 36;
  const windowDeg = 16;
  const fadeMs = 500;

  useEffect(() => {
    const id = setInterval(() => setSweep((s) => (s + 2) % 360), 30);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      setTargets((prev) =>
        prev.map((t) =>
          Math.random() < 0.25
            ? { r: Math.random() * (size / 2 - 22), theta: Math.random() * 360 }
            : t
        )
      );
    }, 6000);
    return () => clearInterval(id);
  }, [size]);

  const cx = size / 2;
  const cy = size / 2;
  const angleDiff = (a, b) => {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  const toXY = (r, thetaDeg) => {
    const th = (thetaDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
  };
  const sectorPath = (r, startDeg, endDeg) => {
    const s = toXY(r, startDeg);
    const e = toXY(r, endDeg);
    const largeArc = Math.abs(endDeg - startDeg) <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
  };
  const fanStart = sweep - fanDeg / 2;
  const fanEnd = sweep + fanDeg / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={size / 2} fill="rgba(0,0,0,0.22)" />
      <circle cx={cx} cy={cy} r={size / 2} stroke="rgba(255,255,255,0.18)" fill="none" />
      <circle cx={cx} cy={cy} r={size / 3} stroke="rgba(255,255,255,0.1)" fill="none" />
      <circle cx={cx} cy={cy} r={size / 6} stroke="rgba(255,255,255,0.06)" fill="none" />
      <line x1={cx} y1={cy - size * 0.46} x2={cx} y2={cy + size * 0.46} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />
      <line x1={cx - size * 0.46} y1={cy} x2={cx + size * 0.46} y2={cy} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />
      <path d={sectorPath(size / 2, fanStart, fanEnd)} fill="rgba(0,255,120,0.18)" />

      {targets.map((t, i) => {
        const d = angleDiff(sweep, t.theta);
        if (d > windowDeg) return null;
        const { x, y } = toXY(t.r, t.theta);
        const intensity = 1 - d / windowDeg;
        const scale = 0.5 + 0.35 * intensity;
        const opacity = 0.18 + 0.82 * intensity;
        return (
          <path
            key={i}
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 
               2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.13 2.44h.74C13.09 5.01 
               14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-8.55 
               11.54L12 21.35z"
            fill="red"
            style={{
              opacity,
              filter: "drop-shadow(0 0 6px rgba(255,0,0,0.65))",
              transition: `opacity ${fadeMs}ms linear, transform ${fadeMs}ms linear`,
              transform: `translate(${x - 12}px, ${y - 12}px) scale(${scale})`,
            }}
          />
        );
      })}
    </svg>
  );
}

/* --------------- Pages ----------------- */
function HomeView({ onOpenFriends, onOpenProfile, user }) {
  return (
    <main className="container">
      <header className="appHeader">
        <h1 className="title">The Radar</h1>
        <div className="accent" />
        <p className="tagline">
          Live updates for when hearts go <span className="tag-ping">ping</span>.
        </p>
        {user && (
          <div className="signedInAs">
            <span className="subtle">Signed in as</span> {user.email}
          </div>
        )}
      </header>

      <section className="glass hero">
        <Radar size={Math.min(window.innerWidth * 0.9, 420)} />
      </section>

      <section className="ctaRow">
        <button className="btn primary" onClick={onOpenFriends}>
          Open Friends
        </button>
        <button className="btn ghost" onClick={onOpenProfile}>
          Your Profile
        </button>
      </section>
    </main>
  );
}

function FriendsView({ meName, onSelectDuco, onSelectYou, user }) {
  const [showFind, setShowFind] = useState(false);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState(null);
  const [sending, setSending] = useState(false);

  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);

  // live friends list (friendships containing me)
  useEffect(() => {
    if (!user) return;
    const qf = query(collection(db, "friendships"), where("members", "array-contains", user.uid));

    const unsub = onSnapshot(
      qf,
      async (snap) => {
        const otherUids = [];
        snap.forEach((d) => {
          const m = d.data().members || [];
          const other = m.find((x) => x !== user.uid);
          if (other) otherUids.push(other);
        });

        const results = [];
        const tasks = otherUids.map(async (uid) => {
          try {
            const s = await getDoc(doc(db, "users", uid));
            if (s.exists()) {
              const data = s.data();
              results.push({
                uid,
                displayName: data.displayName || data.email || "Friend",
                username: data.username || "",
              });
            }
          } catch (e) {
            console.debug("Friend doc fetch skipped:", e?.code || e);
          }
        });
        await Promise.allSettled(tasks);
        setFriends(results);
      },
      (err) => {
        console.warn("Friendships snapshot error:", err?.code || err);
      }
    );

    return () => unsub();
  }, [user]);

  // incoming requests
  useEffect(() => {
    if (!user) return;
    const qr = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(qr, async (snap) => {
      const list = [];
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        const from = await getDoc(doc(db, "users", d.fromUid));
        const fromData = from.exists() ? from.data() : {};
        list.push({
          id: docSnap.id,
          fromUid: d.fromUid,
          fromName: fromData.displayName || fromData.email || "Someone",
          fromUsername: fromData.username || "",
        });
      }
      setIncoming(list);
    });
    return () => unsub();
  }, [user]);

  const doSearch = async () => {
    const queryName = search.trim().toLowerCase();
    if (!queryName) return setFound(null);
    const q = query(collection(db, "users"), where("username", "==", queryName));
    const res = await getDocs(q);
    if (res.empty) return setFound({ none: true });
    const udoc = res.docs[0];
    setFound({ uid: udoc.id, ...udoc.data() });
  };

  const sendRequest = async () => {
    if (!user || !found?.uid) return;
    if (found.uid === user.uid) {
      alert("You can’t send a request to yourself.");
      return;
    }
    setSending(true);
    try {
      const q1 = query(
        collection(db, "friendRequests"),
        where("fromUid", "==", user.uid),
        where("toUid", "==", found.uid),
        where("status", "==", "pending")
      );
      const q2 = query(
        collection(db, "friendRequests"),
        where("fromUid", "==", found.uid),
        where("toUid", "==", user.uid),
        where("status", "==", "pending")
      );
      const [r1, r2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      if (!r1.empty || !r2.empty) {
        alert("Request already pending.");
        setSending(false);
        return;
      }
      const qf = query(
        collection(db, "friendships"),
        where("members", "array-contains", user.uid)
      );
      const fs = await getDocs(qf);
      const already = fs.docs.some((d) => {
        const mem = d.data().members || [];
        return mem.includes(found.uid);
      });
      if (already) {
        alert("You’re already friends.");
        setSending(false);
        return;
      }

      await addDoc(collection(db, "friendRequests"), {
        fromUid: user.uid,
        toUid: found.uid,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      alert("Friend request sent!");
    } finally {
      setSending(false);
    }
  };

  const acceptRequest = async (reqId, fromUid) => {
    if (!user) return;
    await addDoc(collection(db, "friendships"), {
      members: [user.uid, fromUid].sort(),
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "friendRequests", reqId), { status: "accepted", respondedAt: serverTimestamp() });
  };

  const declineRequest = async (reqId) => {
    await updateDoc(doc(db, "friendRequests", reqId), { status: "declined", respondedAt: serverTimestamp() });
  };

  return (
    <main className="container">
      <header className="subHeader">
        <h2 className="h2">Friends</h2>
        <p className="subtle">Find friends by username & manage requests.</p>
      </header>

      <section className="glass" style={{ padding: 12, marginBottom: 10 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="h3">Your friends</div>
          <button className="btn primary" onClick={() => setShowFind(true)}>Find Friends</button>
        </div>

        <div className="list">
          {friends.length > 0 ? friends.map((f) => (
            <article key={f.uid} className="friendCard" onClick={onSelectYou}>
              <div className="avatar" data-initial={(f.displayName || f.username || "?")[0].toUpperCase()} />
              <div className="friendMeta">
                <div className="friendName">{f.displayName || f.username}</div>
                <div className="friendNote">@{f.username}</div>
              </div>
            </article>
          )) : (
            <div className="subtle">No friends yet.</div>
          )}
        </div>
      </section>

      <section className="glass" style={{ padding: 12 }}>
        <div className="h3" style={{ marginBottom: 8 }}>Friend requests</div>
        {incoming.length > 0 ? (
          <div className="list">
            {incoming.map((r) => (
              <article key={r.id} className="friendCard">
                <div className="avatar" data-initial={(r.fromName || "S")[0].toUpperCase()} />
                <div className="friendMeta">
                  <div className="friendName">{r.fromName}</div>
                  <div className="friendNote">@{r.fromUsername}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button className="btn xs primary" onClick={() => acceptRequest(r.id, r.fromUid)}>Accept</button>
                  <button className="btn xs ghost" onClick={() => declineRequest(r.id)}>Decline</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="subtle">No incoming requests.</div>
        )}
      </section>

      {showFind && (
        <div className="modalOverlay" onClick={() => setShowFind(false)}>
          <div className="modalCard glass" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="h3">Find Friends</div>
              <button className="btn xs ghost" onClick={() => setShowFind(false)}>Close</button>
            </div>
            <div className="formGrid">
              <label className="field">
                <span>Username</span>
                <input
                  className="input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="e.g. duco_123"
                />
              </label>
              <button className="btn primary" onClick={doSearch}>Search</button>
            </div>

            <div style={{ marginTop: 10 }}>
              {found === null ? null : found.none ? (
                <div className="subtle">No user found.</div>
              ) : (
                <div className="row between" style={{ alignItems: "center" }}>
                  <div>
                    <div className="h3">{found.displayName || found.email}</div>
                    <div className="subtle">@{found.username}</div>
                  </div>
                  <button className="btn primary" disabled={sending} onClick={sendRequest}>
                    {sending ? "Sending..." : "Send Request"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* --------------- ProfileView (with Masterlist + Updates) ----------------- */
function ProfileView({ name = "User" }) {
  // ----- settings (same as before) -----
  const [showSettings, setShowSettings] = useState(false);
  const [newName, setNewName] = useState(name);
  const [saving, setSaving] = useState(false);

  const saveName = async () => {
    try {
      setSaving(true);
      await updateProfile(auth.currentUser, { displayName: newName });
      setShowSettings(false);
      alert("Display name updated!");
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ===== Masterlist state =====
  const [people, setPeople] = useState([]);
  const [activeTab, setActiveTab] = useState("updates");
  const [editingId, setEditingId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // ---- helpers ----
  const ringRadiusPct = (ring) => {
    if (ring === "inner") return 0.28;
    if (ring === "medium") return 0.42;
    return 0.54;
  };

  // ===== Modal =====
  const Modal = ({ children, onClose, title }) => (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard glass" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="h3">{title}</div>
          <button className="btn xs ghost" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );

  // ===== Add/Edit state =====
  const emptyForm = { name: "", age: "", description: "", ring: "medium", photoUrl: "" };
  const currentEditing = editingId ? people.find((p) => p.id === editingId) : null;
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => { setForm(emptyForm); setShowAddModal(true); };
  const openEdit = (p) => { 
    setForm({
      name: p.name,
      age: String(p.age ?? ""),
      description: p.description ?? "",
      ring: p.ring,
      photoUrl: p.photoUrl ?? ""
    });
    setEditingId(p.id);
  };
  const closeModals = () => { setShowAddModal(false); setEditingId(null); };

  const submitAdd = () => {
    if (!form.name.trim()) { alert("Please enter a name"); return; }
    const angleDeg = Math.floor(Math.random() * 360);
    const newPerson = { id: crypto.randomUUID(), ...form, age: form.age ? Number(form.age) : "", angleDeg };
    setPeople((prev) => [...prev, newPerson]);
    setShowAddModal(false);
  };

  const submitEdit = () => {
    if (!currentEditing) return;
    setPeople((prev) =>
      prev.map((p) => p.id === currentEditing.id ? { ...p, ...form, age: form.age ? Number(form.age) : "" } : p)
    );
    setEditingId(null);
  };

  const removePerson = () => {
    if (!currentEditing) return;
    setPeople((prev) => prev.filter((p) => p.id !== currentEditing.id));
    setEditingId(null);
  };

  // ===== Animated radar =====
  const ProfileRadarAnimated = ({ size = 320 }) => {
    const [sweep, setSweep] = useState(0);
    const cx = size / 2, cy = size / 2;

    const fanDeg = 36;
    const windowDeg = 16;
    const fadeMs = 450;

    useEffect(() => {
      const id = setInterval(() => setSweep((s) => (s + 2) % 360), 30);
      return () => clearInterval(id);
    }, []);

    const toXY = (r, deg) => {
      const th = (deg * Math.PI) / 180;
      return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
    };
    const angleDiff = (a, b) => {
      let d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    };
    const sectorPath = (r, startDeg, endDeg) => {
      const s = toXY(r, startDeg);
      const e = toXY(r, endDeg);
      const largeArc = Math.abs(endDeg - startDeg) <= 180 ? 0 : 1;
      return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
    };

    const fanStart = sweep - fanDeg / 2;
    const fanEnd = sweep + fanDeg / 2;

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
        <circle cx={cx} cy={cy} r={size/2} fill="rgba(0,0,0,0.18)" />
        <circle cx={cx} cy={cy} r={size/2} stroke="rgba(255,255,255,0.18)" fill="none" />
        <circle cx={cx} cy={cy} r={size/3} stroke="rgba(255,255,255,0.10)" fill="none" />
        <circle cx={cx} cy={cy} r={size/6} stroke="rgba(255,255,255,0.06)" fill="none" />
        <line x1={cx} y1={cy - size*0.46} x2={cx} y2={cy + size*0.46} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />
        <line x1={cx - size*0.46} y1={cy} x2={cx + size*0.46} y2={cy} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />
        <path d={sectorPath(size/2, fanStart, fanEnd)} fill="rgba(0,255,120,0.18)" />

        {people.map((p) => {
          if (typeof p.angleDeg !== "number") return null;
          const r = (size/2) * ringRadiusPct(p.ring);
          const d = angleDiff(sweep, p.angleDeg);
          if (d > windowDeg) return null;
          const { x, y } = toXY(r, p.angleDeg);
          const opacity = 0.18 + 0.82 * (1 - d / windowDeg);
          return (
            <g key={p.id} transform={`translate(${x}, ${y})`} style={{ opacity, transition: `opacity ${fadeMs}ms linear` }}>
              {p.photoUrl
                ? <image href={p.photoUrl} x={-14} y={-14} width="28" height="28" preserveAspectRatio="xMidYMid slice" />
                : <circle r="6" fill="#6dff9a" />}
              <text x="0" y="24" textAnchor="middle" fontSize="12" fill="#e8ffe8">{p.name}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  // ===== UI =====
  return (
    <main className="container">
      <header className="subHeader">
        <h2 className="h2">{(newName || name)}&apos;s Radar</h2>
        <p className="subtle">Masterlist & updates</p>
        <button className="btn xs ghost" onClick={() => setShowSettings(true)}>Settings</button>
      </header>

      {/* Tabs */}
      <section className="tabs">
        <button className={`chip ${activeTab === "updates" ? "chip--active" : ""}`} onClick={() => { setActiveTab("updates"); setEditMode(false); }}>Updates</button>
        <button className={`chip ${activeTab === "master" ? "chip--active" : ""}`} onClick={() => setActiveTab("master")}>Masterlist</button>
      </section>

      {/* Updates tab (demo placeholder) */}
      {activeTab === "updates" && !showSettings && (
        <section className="glass timeline">
          <ul className="tl">
            <li><span className="dot" /><div className="tl-item"><div className="tl-title">Demo Update</div><div className="tl-meta">Today</div></div></li>
          </ul>
        </section>
      )}

      {/* Masterlist tab */}
      {activeTab === "master" && !showSettings && (
        <>
          {!editMode ? (
            <>
              <section className="glass hero">
                <ProfileRadarAnimated size={Math.min(window.innerWidth * 0.9, 420)} />
              </section>
              <section className="ctaRow" style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={openAdd}>Add to Radar</button>
                <button className="btn ghost" onClick={() => setEditMode(true)}>Edit Radar</button>
              </section>
            </>
          ) : (
            <>
              <section className="glass hero"><div>TODO: EditCanvas here</div></section>
              <section className="ctaRow" style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={() => setEditMode(false)}>Done</button>
                <button className="btn ghost" onClick={openAdd}>Add to Radar</button>
              </section>
            </>
          )}
        </>
      )}

      {/* Settings panel */}
      {showSettings && (
        <section className="glass settingsBox" style={{ marginTop: 8 }}>
          <h3>Edit Profile</h3>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter new display name" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn primary" onClick={saveName} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            <button className="btn ghost" onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </section>
      )}

      {/* Add modal */}
      {showAddModal && (
        <Modal title="Add to Radar" onClose={closeModals}>
          <div className="formGrid">
            <label className="field"><span>Name</span><input className="input" value={form.name} onChange={(e)=>setForm(f=>({...f, name:e.target.value}))} /></label>
            <label className="field"><span>Age</span><input className="input" type="number" value={form.age} onChange={(e)=>setForm(f=>({...f, age:e.target.value}))} /></label>
            <label className="field"><span>Photo URL</span><input className="input" value={form.photoUrl} onChange={(e)=>setForm(f=>({...f, photoUrl:e.target.value}))} /></label>
            <label className="field"><span>Description</span><textarea className="input" rows={3} value={form.description} onChange={(e)=>setForm(f=>({...f, description:e.target.value}))} /></label>
            <label className="field"><span>Ring</span><select className="input" value={form.ring} onChange={(e)=>setForm(f=>({...f, ring:e.target.value}))}><option value="inner">Inner</option><option value="medium">Medium</option><option value="outer">Outer</option></select></label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn primary" onClick={submitAdd}>Add</button>
            <button className="btn ghost" onClick={closeModals}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editingId && currentEditing && (
        <Modal title="Edit Radar Entry" onClose={closeModals}>
          <div className="formGrid">
            <label className="field"><span>Name</span><input className="input" value={form.name} onChange={(e)=>setForm(f=>({...f, name:e.target.value}))} /></label>
            <label className="field"><span>Age</span><input className="input" type="number" value={form.age} onChange={(e)=>setForm(f=>({...f, age:e.target.value}))} /></label>
            <label className="field"><span>Photo URL</span><input className="input" value={form.photoUrl} onChange={(e)=>setForm(f=>({...f, photoUrl:e.target.value}))} /></label>
            <label className="field"><span>Description</span><textarea className="input" rows={3} value={form.description} onChange={(e)=>setForm(f=>({...f, description:e.target.value}))} /></label>
            <label className="field"><span>Ring</span><select className="input" value={form.ring} onChange={(e)=>setForm(f=>({...f, ring:e.target.value}))}><option value="inner">Inner</option><option value="medium">Medium</option><option value="outer">Outer</option></select></label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={submitEdit}>Save</button>
            <button className="btn ghost" onClick={removePerson}>Remove</button>
            <button className="btn ghost" onClick={closeModals}>Cancel</button>
          </div>
        </Modal>
      )}
    </main>
  );
}


/* ----------------- Main App (post-login) ----------------- */
function MainApp({ user }) {
  const meName = deriveNameFromUser(user);
  const [tab, setTab] = useState("home");
  const [currentProfile, setCurrentProfile] = useState(meName);

  useEffect(() => {
    setCurrentProfile((prev) => (prev === "Duco" || prev === "You" ? meName : prev));
  }, [meName]);

  useEffect(() => {
    ensureUserDoc(user);
  }, [user]);

  return (
    <>
      {tab === "home" && (
        <HomeView
          user={user}
          onOpenFriends={() => setTab("friends")}
          onOpenProfile={() => {
            setCurrentProfile(meName);
            setTab("profile");
          }}
        />
      )}
      {tab === "friends" && (
        <FriendsView
          user={user}
          meName={meName}
          onSelectDuco={() => {
            setCurrentProfile("Duco");
            setTab("profile");
          }}
          onSelectYou={() => {
            setCurrentProfile(meName);
            setTab("profile");
          }}
        />
      )}

      {tab === "profile" && <ProfileView name={currentProfile} />}

      <nav className="nav">
        <button className={`navBtn ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
          <HomeIcon /> <span>Home</span>
        </button>
        <button className={`navBtn ${tab === "friends" ? "active" : ""}`} onClick={() => setTab("friends")}>
          <UsersIcon /> <span>Friends</span>
        </button>
        <button className={`navBtn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
          <UserIcon /> <span>Profile</span>
        </button>
        <button className="navBtn" onClick={() => signOut(auth)} title="Log out">
          <LogoutIcon /> <span>Logout</span>
        </button>
      </nav>
    </>
  );
}

/* ----------------- Auth gating ----------------- */
export default function App() {
  const [user, setUser] = useState();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) {
    return (
      <div className="screen">
        <main className="container">
          <header className="appHeader">
            <h1 className="title">The Radar</h1>
            <div className="accent" />
            <p className="tagline">loading session…</p>
          </header>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="screen">
        <Auth />
      </div>
    );
  }

  return (
    <div className="screen">
      <MainApp user={user} />
    </div>
  );
}
