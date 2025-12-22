// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import Auth from "./Auth";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { isSupported, getMessaging, getToken, deleteToken } from "firebase/messaging";
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
  limit,
  collectionGroup,
} from "firebase/firestore";

/* ---------------- Icons ---------------- */
const HomeIcon = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M3 10.5L12 4l9 6.5V20a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2v-9.5Z"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const UsersIcon = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M16 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M21 21v-1.2a3.6 3.6 0 0 0-3-3.5"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M17.5 4.8a2.8 2.8 0 1 1 0 5.6"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const UserIcon = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M4 20a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const LogoutIcon = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M16 17l5-5-5-5M21 12H9"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/* ---- Shared radar geometry ---- */
const EDGE_MARGIN = 16; // keep dots/labels away from the edge
const RING_FRACTIONS = { inner: 0.30, medium: 0.58, outer: 0.90 };
const ringRadiusPx = (size, ring) =>
  (size / 2 - EDGE_MARGIN) * (RING_FRACTIONS[ring] || RING_FRACTIONS.medium);

/* ---- Helpers ---- */
const deriveNameFromUser = (u) => {
  if (!u) return "You";
  if (u.displayName && u.displayName.trim()) return u.displayName.trim();
  const raw = (u.email || "you").split("@")[0];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

function timeAgo(ts) {
  const ms =
    typeof ts === "number"
      ? ts
      : ts?.toMillis
      ? ts.toMillis()
      : Number(ts) || 0;

  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ---- Ensure user + radar root docs exist ---- */
async function ensureUserDoc(user) {
  if (!user) return;

  // users/{uid}
  const uref = doc(db, "users", user.uid);
  const usnap = await getDoc(uref);
  if (!usnap.exists()) {
    const guess = (user.email || "user")
      .split("@")[0]
      .replace(/[^a-z0-9_]/gi, "")
      .toLowerCase();

    await setDoc(uref, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      username: guess,
      createdAt: serverTimestamp(),
    });
  }

  // radars/{uid}
  const rref = doc(db, "radars", user.uid);
  const rsnap = await getDoc(rref);
  if (!rsnap.exists()) {
    await setDoc(rref, {
      owner: user.uid,
      createdAt: serverTimestamp(),
    });
  }
}

/* === Firestore path helpers === */
const peopleCol = (uid) => collection(db, "radars", uid, "people");
const updatesCol = (uid, personId) => collection(db, "radars", uid, "people", personId, "updates");
const commentsCol = (uid, personId, updateId) =>
  collection(db, "radars", uid, "people", personId, "updates", updateId, "comments");

/* ---------- Reusable Updates+Comments block ---------- */
const EditUpdates = React.memo(function EditUpdates({
  personId,
  updates = [],
  commentDrafts,
  setCommentDrafts,
  addUpdateToPerson,
  addCommentToUpdate,
  canWrite = false, // owner-only composer
}) {
  return (
    <>
      <hr style={{ borderColor: "rgba(255,255,255,0.12)", margin: "10px 0" }} />
      <div className="h4" style={{ marginBottom: 6 }}>Updates</div>

      {/* Add new update (owner only) */}
      {canWrite && (
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
              try {
                await addUpdateToPerson(personId, text);
              } catch (err) {
                console.error("addUpdateToPerson failed:", err);
                alert(err?.message || "Could not add update.");
              }
              setCommentDrafts((d) => {
                const { [`__new_${personId}`]: _, ...rest } = d;
                return rest;
              });
            }}
          >
            Add Update
          </button>
        </div>
      )}

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

                {/* add a comment (signed-in users allowed by rules) */}
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

/* --------------- Home Radar (fun animated hearts) ----------------- */
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

/* ---------------- Instruments (new Home) ---------------- */
function InstrumentsView({ user, onOpenFriend }) {
  const [friends, setFriends] = useState([]); // [{uid, displayName, username}]
  const [peopleByUid, setPeopleByUid] = useState({}); // { [uid]: people[] }

  // Live friends list
  useEffect(() => {
    if (!user?.uid) return;
    const qf = query(collection(db, "friendships"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(qf, async (snap) => {
      const otherUids = [];
      snap.forEach((d) => {
        const mem = d.data().members || [];
        const other = mem.find((x) => x !== user.uid);
        if (other) otherUids.push(other);
      });

      const rows = [];
      await Promise.allSettled(
        otherUids.map(async (uid) => {
          try {
            const s = await getDoc(doc(db, "users", uid));
            if (s.exists()) {
              const data = s.data();
              rows.push({
                uid,
                displayName: data.displayName || data.email || "Friend",
                username: (data.username || "").toLowerCase(),
              });
            }
          } catch (e) {
            console.debug("Friend fetch skipped:", e?.code || e);
          }
        })
      );

      // stable sort by name
      rows.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
      setFriends(rows);
    });
    return () => unsub();
  }, [user?.uid]);

  // Live people listeners per friend (so each card has a radar)
  useEffect(() => {
    if (!friends.length) {
      setPeopleByUid({});
      return;
    }

    const unsubs = [];
    friends.forEach((f) => {
      const qp = query(peopleCol(f.uid), orderBy("createdAt", "desc"), limit(50));
      const unsub = onSnapshot(
        qp,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setPeopleByUid((prev) => ({ ...prev, [f.uid]: arr }));
        },
        (err) => {
          console.debug("people snapshot error:", err?.code || err);
          setPeopleByUid((prev) => ({ ...prev, [f.uid]: [] }));
        }
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [friends]);

  return (
    <main className="container">
      <header className="appHeader" style={{ marginBottom: 10 }}>
        <h1 className="title">The Radar</h1>
        <div className="accent" />
        <div className="instrumentSubtitle">Your instrument panel</div>
      </header>

      <section className="panel" style={{ width: "100%" }}>
        {friends.length ? (
          <div className="instrumentList">
            {friends.map((f) => (
              <button
                key={f.uid}
                className="instrumentCard"
                type="button"
                onClick={() => onOpenFriend(f)}
                aria-label={`Open ${f.displayName || "friend"} radar`}
              >
                <div className="instrumentCardTitle">{(f.displayName || f.username || "Friend") + "’s Radar"}</div>
                <div className="instrumentRadarWrap">
                  <ProfileRadarAnimated size={300} people={peopleByUid[f.uid] || []} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="glass" style={{ padding: 12, borderRadius: 14 }}>
            <div className="h3" style={{ marginBottom: 6 }}>No friends yet</div>
            <div className="subtle">
              Add friends in Updates, then their radars will appear here.
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------------- FriendsView with Notifications ---------------- */
function FriendsView({ meName, onSelectFriend, user }) {
  const [showFind, setShowFind] = useState(false);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState(null);
  const [sending, setSending] = useState(false);

  const [friends, setFriends] = useState([]);   // [{uid, displayName, username}]
  const [incoming, setIncoming] = useState([]); // [{id, fromUid, fromName, fromUsername}]

  // 🔔 Notifications feed
  const [notifications, setNotifications] = useState([]);

  const friendMap = useMemo(() => {
    const m = {};
    friends.forEach((f) => (m[f.uid] = f));
    return m;
  }, [friends]);

  // live friends list
  useEffect(() => {
    if (!user?.uid) return;
    const qf = query(collection(db, "friendships"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(qf, async (snap) => {
      const otherUids = [];
      snap.forEach((d) => {
        const mem = d.data().members || [];
        const other = mem.find((x) => x !== user.uid);
        if (other) otherUids.push(other);
      });

      const rows = [];
      await Promise.allSettled(
        otherUids.map(async (uid) => {
          try {
            const s = await getDoc(doc(db, "users", uid));
            if (s.exists()) {
              const data = s.data();
              rows.push({
                uid,
                displayName: data.displayName || data.email || "Friend",
                username: (data.username || "").toLowerCase(),
              });
            }
          } catch (e) {
            console.debug("Friend fetch skipped:", e?.code || e);
          }
        })
      );
      setFriends(rows);
    });
    return () => unsub();
  }, [user?.uid]);

  // live incoming requests
  useEffect(() => {
    if (!user?.uid) return;
    const qr = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(qr, async (snap) => {
      const list = [];
      for (const d of snap.docs) {
        const req = d.data();
        const fromSnap = await getDoc(doc(db, "users", req.fromUid));
        const fromData = fromSnap.exists() ? fromSnap.data() : {};
        list.push({
          id: d.id,
          fromUid: req.fromUid,
          fromName: fromData.displayName || fromData.email || "Someone",
          fromUsername: (fromData.username || "").toLowerCase(),
        });
      }
      setIncoming(list);
    });
    return () => unsub();
  }, [user?.uid]);

  // search by username
  const doSearch = async () => {
    const qname = search.trim().toLowerCase();
    if (!qname) return setFound(null);
    const q = query(collection(db, "users"), where("username", "==", qname));
    const res = await getDocs(q);
    if (res.empty) return setFound({ none: true });
    const udoc = res.docs[0];
    setFound({ uid: udoc.id, ...udoc.data() });
  };

  // send friend request
  const sendRequest = async () => {
    if (!user || !found?.uid) return;
    if (found.uid === user.uid) return alert("You can’t send a request to yourself.");
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
        return;
      }
      // existing friendship?
      const qf = query(collection(db, "friendships"), where("members", "array-contains", user.uid));
      const fs = await getDocs(qf);
      const already = fs.docs.some((d) => (d.data().members || []).includes(found.uid));
      if (already) {
        alert("You’re already friends.");
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

  // accept / decline
  const acceptRequest = async (reqId, fromUid) => {
    if (!user?.uid) return;
    await addDoc(collection(db, "friendships"), {
      members: [user.uid, fromUid].sort(),
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "friendRequests", reqId), {
      status: "accepted",
      respondedAt: serverTimestamp(),
    });
  };
  const declineRequest = async (reqId) => {
    await updateDoc(doc(db, "friendRequests", reqId), {
      status: "declined",
      respondedAt: serverTimestamp(),
    });
  };

  /* ===================== Notifications ===================== */

  // People added + new updates (per friend)
  useEffect(() => {
    if (!user?.uid || friends.length === 0) {
      setNotifications((prev) => prev.filter((n) => n._src !== "people" && n._src !== "updates"));
      return;
    }

    const unsubs = [];
    const bucket = { people: [], updates: [] };

    const publish = () => {
      setNotifications((prev) => {
        const comments = prev.filter((n) => n._src === "comments");
        const combined = [...bucket.people, ...bucket.updates, ...comments]
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 60);
        return combined;
      });
    };

    friends.forEach((fr) => {
      const fuid = fr.uid;

      // 1) People added (latest 10)
      const qp = query(
        collection(db, "radars", fuid, "people"),
        orderBy("createdAt", "desc"),
        limit(10)
      );
      const unsubPeople = onSnapshot(qp, (snap) => {
        const items = [];
        snap.forEach((d) => {
          const data = d.data();
          const ts = data.createdAt?.toMillis?.() ?? 0;
          const ownerName = fr.displayName || fr.username || "Friend";
          const personName = data.name || "Unnamed";
          items.push({
            id: `p:${fuid}:${d.id}`,
            _src: "people",
            ts,
            text: `${ownerName} added ${personName} to their radar.`,
          });
        });
        bucket.people = [
          ...bucket.people.filter((x) => !x.id.startsWith(`p:${fuid}:`)),
          ...items,
        ];
        publish();
      });
      unsubs.push(unsubPeople);

      // 2) New updates per person (listen to a few recent people)
      const unsubPeopleForUpdates = onSnapshot(qp, (snap) => {
        const perFriendUnsubs = [];
        snap.forEach((d) => {
          const pid = d.id;
          const pdata = d.data();
          const personName = pdata.name || "Unnamed";
          const qu = query(
            collection(db, "radars", fuid, "people", pid, "updates"),
            orderBy("ts", "desc"),
            limit(3)
          );
          const unsubU = onSnapshot(qu, (usnap) => {
            // remove old entries for this friend+person
            bucket.updates = bucket.updates.filter(
              (x) => !(x._friend === fuid && x._person === pid)
            );
            usnap.forEach((uDoc) => {
              const uData = uDoc.data();
              const ts = uData.ts?.toMillis?.() ?? 0;
              const ownerName = fr.displayName || fr.username || "Friend";
              bucket.updates.push({
                id: `u:${fuid}:${pid}:${uDoc.id}`,
                _src: "updates",
                _friend: fuid,
                _person: pid,
                ts,
                text: `${ownerName} posted a new update about ${personName}.`,
              });
            });
            publish();
          });
          perFriendUnsubs.push(unsubU);
        });
        // clean up when people snapshot changes
        unsubs.push(() => perFriendUnsubs.forEach((fn) => fn && fn()));
      });
      unsubs.push(unsubPeopleForUpdates);
    });

    return () => unsubs.forEach((fn) => fn && fn());
  }, [user?.uid, friends]);

  // Comments collectionGroup (author or owner must be my friend)
  useEffect(() => {
    if (!user?.uid) return;
    const friendIds = new Set(friends.map((f) => f.uid));

    const qc = query(collectionGroup(db, "comments"), orderBy("ts", "desc"), limit(60));
    const unsub = onSnapshot(qc, (snap) => {
      const items = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const ts = data.ts?.toMillis?.() ?? 0;
        // path: radars/{ownerUid}/people/{pid}/updates/{updateId}/comments/{commentId}
        const parts = docSnap.ref.path.split("/");
        if (parts.length < 8 || parts[0] !== "radars") return;
        const ownerUid = parts[1];
        const authorUid = data.authorUid || "anon";

        if (!friendIds.has(ownerUid) && !friendIds.has(authorUid)) return;

        const ownerName =
          friendMap[ownerUid]?.displayName ||
          friendMap[ownerUid]?.username ||
          (ownerUid === user.uid ? (user.displayName || user.email || "You") : "Friend");

        const authorName =
          friendMap[authorUid]?.displayName ||
          friendMap[authorUid]?.username ||
          (authorUid === user.uid ? (user.displayName || user.email || "You") : "Someone");

        items.push({
          id: `c:${docSnap.id}`,
          _src: "comments",
          ts,
          text: `${authorName} commented on ${ownerName}'s radar update.`,
        });
      });

      setNotifications((prev) => {
        const others = prev.filter((n) => n._src !== "comments");
        return [...others, ...items].sort((a, b) => b.ts - a.ts).slice(0, 60);
      });
    });

    return () => unsub();
  }, [user?.uid, friends, friendMap]);

  /* -------------------------- UI -------------------------- */
  return (
    <main className="container">
      <header className="subHeader">
        <h2 className="h2">Friends</h2>
        <p className="subtle">Find friends by username & manage requests.</p>
      </header>

      {/* Friends list */}
      <section className="glass" style={{ padding: 12, marginBottom: 10 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="h3">Your friends</div>
          <button className="btn primary" onClick={() => setShowFind(true)}>
            Find Friends
          </button>
        </div>

        <div className="list">
          {friends.length ? (
            friends.map((f) => (
              <article
                key={f.uid}
                className="friendCard"
                role="button"
                tabIndex={0}
                onClick={() => onSelectFriend && onSelectFriend(f)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && onSelectFriend) onSelectFriend(f);
                }}
                style={{ cursor: "pointer" }}
              >
                <div
                  className="avatar"
                  data-initial={(f.displayName || f.username || "?")[0].toUpperCase()}
                />
                <div className="friendMeta">
                  <div className="friendName">{f.displayName || f.username}</div>
                  {f.username && <div className="subtle">@{f.username}</div>}
                </div>
              </article>
            ))
          ) : (
            <div className="subtle">No friends yet.</div>
          )}
        </div>
      </section>

      {/* Incoming requests */}
      <section className="glass" style={{ padding: 12 }}>
        <div className="h3" style={{ marginBottom: 8 }}>Friend requests</div>
        {incoming.length ? (
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

      {/* 🔔 Notifications */}
      <section className="glass" style={{ padding: 12, marginTop: 12 }}>
        <div className="row between" style={{ alignItems: "center", marginBottom: 8 }}>
          <div className="h3">Notifications</div>
          <div className="subtle" style={{ fontSize: 12 }}>Showing latest activity</div>
        </div>

        {notifications.length ? (
          <div style={{ maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
            <ul className="list" style={{ alignItems: "stretch", gap: 8 }}>
              {notifications.slice(0, 50).map((n) => (
                <li
                  key={n.id}
                  className="glass"
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={n.text}
                  >
                    {n.text}
                  </div>
                  <div className="subtle" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {timeAgo(n.ts)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="subtle">No notifications yet.</div>
        )}
      </section>

      {/* Find Friends modal */}
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

/* ---- Animated profile radar with names near sweep ---- */
function ProfileRadarAnimated({ size = 320, people = [] }) {
  const [sweep, setSweep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSweep((s) => (s + 2) % 360), 30);
    return () => clearInterval(id);
  }, []);

  const cx = size / 2, cy = size / 2;
  const R = size / 2;

  const guide = {
    inner:  (R - EDGE_MARGIN) * RING_FRACTIONS.inner,
    medium: (R - EDGE_MARGIN) * RING_FRACTIONS.medium,
    outer:  (R - EDGE_MARGIN) * RING_FRACTIONS.outer,
  };

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

  const fanDeg = 36;
  const windowDeg = 18;
  const fanStart = sweep - fanDeg / 2;
  const fanEnd   = sweep + fanDeg / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      {/* background + rings */}
      <circle cx={cx} cy={cy} r={R} fill="rgba(0,0,0,0.22)" />
      <circle cx={cx} cy={cy} r={guide.outer}  stroke="rgba(255,255,255,0.18)" fill="none" />
      <circle cx={cx} cy={cy} r={guide.medium} stroke="rgba(255,255,255,0.12)" fill="none" />
      <circle cx={cx} cy={cy} r={guide.inner}  stroke="rgba(255,255,255,0.08)" fill="none" />
      <line x1={cx} y1={cy - guide.outer} x2={cx} y2={cy + guide.outer} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />
      <line x1={cx - guide.outer} y1={cy} x2={cx + guide.outer} y2={cy} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />
      <path d={sectorPath(guide.outer, fanStart, fanEnd)} fill="rgba(0,255,120,0.18)" />

      {/* blips + labels (names fade in near sweep) */}
      {people.map((p, i) => {
        if (typeof p.angleDeg !== "number") return null;

        const r = ringRadiusPx(size, p.ring);
        const { x, y } = toXY(r, p.angleDeg);

        const d = angleDiff(sweep, p.angleDeg);
        if (d > windowDeg) return null;

        const intensity = 1 - d / windowDeg;
        const labelOffset = 10;
        const rad = (p.angleDeg * Math.PI) / 180;
        const lx = x + Math.cos(rad) * labelOffset;
        const ly = y + Math.sin(rad) * labelOffset;

        return (
          <g
            key={p.id || i}
            style={{
              opacity: 0.25 + 0.75 * intensity,
              transition: "opacity 120ms linear",
            }}
          >
            <circle cx={x} cy={y} r={4} fill="rgba(0,255,120,0.9)" />
            <text x={lx} y={ly} fontSize="12" fill="#E6FFE8" dominantBaseline="middle">
              {p.name || "Unnamed"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---- Static profile radar with labels ---- */
function ProfileRadarStatic({ size = 320, people = [] }) {
  const cx = size / 2, cy = size / 2;
  const R = size / 2;

  const guide = {
    inner:  (R - EDGE_MARGIN) * RING_FRACTIONS.inner,
    medium: (R - EDGE_MARGIN) * RING_FRACTIONS.medium,
    outer:  (R - EDGE_MARGIN) * RING_FRACTIONS.outer,
  };

  const toXY = (r, deg) => {
    const th = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={R} fill="rgba(0,0,0,0.22)" />
      <circle cx={cx} cy={cy} r={guide.outer}  stroke="rgba(255,255,255,0.18)" fill="none" />
      <circle cx={cx} cy={cy} r={guide.medium} stroke="rgba(255,255,255,0.12)" fill="none" />
      <circle cx={cx} cy={cy} r={guide.inner}  stroke="rgba(255,255,255,0.08)" fill="none" />
      <line x1={cx} y1={cy - guide.outer} x2={cx} y2={cy + guide.outer} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />
      <line x1={cx - guide.outer} y1={cy} x2={cx + guide.outer} y2={cy} stroke="rgba(0,255,120,0.12)" strokeWidth="1" />

      {people.map((p, i) => {
        if (typeof p.angleDeg !== "number") return null;

        const r = ringRadiusPx(size, p.ring);
        const { x, y } = toXY(r, p.angleDeg);

        // place label slightly outward
        const rad = (p.angleDeg * Math.PI) / 180;
        const offset = 12;
        let lx = x + Math.cos(rad) * offset;
        let ly = y + Math.sin(rad) * offset;

        // keep label inside outer guide
        const maxR = guide.outer - 6;
        const dx = lx - cx, dy = ly - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > maxR) {
          const s = maxR / dist;
          lx = cx + dx * s;
          ly = cy + dy * s;
        }

        return (
          <g key={p.id || i}>
            <circle cx={x} cy={y} r={4} fill="rgba(0,255,120,0.9)" />
            <text
              x={lx}
              y={ly}
              fontSize="12"
              fill="#E6FFE8"
              dominantBaseline="middle"
              paintOrder="stroke"
              stroke="rgba(0,0,0,0.6)"
              strokeWidth="2"
            >
              {p.name || "Unnamed"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --------------- ProfileView (friend-aware) ----------------- */
function ProfileView({ name = "User", uid, onBack = null, radarMode = "toggle" }) {
  const effectiveUid = uid;
  const currentUid = auth.currentUser?.uid || null;
  const isOwner = currentUid === effectiveUid;

  // state
  const [detailsPerson, setDetailsPerson] = useState(null); // friend details modal
  const [showSettings, setShowSettings] = useState(false);
  const [newName, setNewName] = useState(name);
  const [saving, setSaving] = useState(false);

  const [friendData, setFriendData] = useState(null);

  const [people, setPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState(null);

  const [animated, setAnimated] = useState(radarMode === "toggle");

  useEffect(() => {
    if (radarMode === "static") setAnimated(false);
    if (radarMode === "toggle") setAnimated(true);
  }, [radarMode]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    age: "",
    description: "",
    ring: "medium",
    photoUrl: "",
    angleDeg: 0,
  });

  const [commentDrafts, setCommentDrafts] = useState({});
  const [updatesByPerson, setUpdatesByPerson] = useState({});

  const headerName = isOwner
    ? (newName || name)
    : (friendData?.displayName || friendData?.username || name || "Friend");

  // ---- Notifications (per-device toggle) ----
  const [notifSupported, setNotifSupported] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [notifEnabled, setNotifEnabled] = useState(!!localStorage.getItem("fcmToken"));
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    (async () => setNotifSupported(await isSupported()))();
  }, []);

  async function ensureSW() {
    let reg = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    }
    return reg;
  }

  async function enableNotifications() {
    try {
      setNotifBusy(true);
      if (!notifSupported) {
        alert("Notifications are not supported in this browser.");
        return;
      }
      const reg = await ensureSW();

      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
        if (perm !== "granted") return;
      }

      const messaging = getMessaging();
      const vapidKey = "BL8bZONCko8z7cHQ9585Dmba3LOYGG-Fy_yraLVvy2HJ8T2QoUudt-6UmdnGYRniOsKVn5lxZl6jJv4itkGSERk";
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
      if (!token) return;

      await setDoc(doc(db, "users", auth.currentUser.uid, "tokens", token), {
        token,
        ua: navigator.userAgent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        enabled: true,
      });

      localStorage.setItem("fcmToken", token);
      setNotifEnabled(true);
    } catch (e) {
      console.error("Enable notifications failed:", e);
      alert(e?.message || "Could not enable notifications.");
    } finally {
      setNotifBusy(false);
    }
  }

  async function disableNotifications() {
    try {
      setNotifBusy(true);
      const stored = localStorage.getItem("fcmToken");
      if (stored) {
        await deleteDoc(doc(db, "users", auth.currentUser.uid, "tokens", stored));
      }
      localStorage.removeItem("fcmToken");
      setNotifEnabled(false);
    } catch (e) {
      console.error("Disable notifications failed:", e);
      alert(e?.message || "Could not disable notifications.");
    } finally {
      setNotifBusy(false);
    }
  }

  function toggleNotifications() {
    if (notifEnabled) disableNotifications();
    else enableNotifications();
  }

  // Load people (safe if createdAt missing)
  useEffect(() => {
    if (!effectiveUid) return;

    const ref = peopleCol(effectiveUid);
    let qRef;
    try {
      qRef = query(ref, orderBy("createdAt", "asc"));
    } catch {
      qRef = ref; // fallback if no index
    }

    const unsub = onSnapshot(qRef, (snap) => {
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return ta - tb;
      });
      setPeople(rows);
    });

    return () => unsub();
  }, [effectiveUid]);

  // Friend header data
  useEffect(() => {
    (async () => {
      if (!effectiveUid) return;
      try {
        const uref = doc(db, "users", effectiveUid);
        const usnap = await getDoc(uref);
        setFriendData(usnap.exists() ? usnap.data() : null);
      } catch (e) {
        console.warn("Failed to load friendData:", e);
      }
    })();
  }, [effectiveUid]);

  // Keep selection valid
  useEffect(() => {
    if (selectedPersonId && !people.some((p) => p.id === selectedPersonId)) {
      setSelectedPersonId(null);
    }
  }, [people, selectedPersonId]);

  // Live updates + comments (merge comments into updates so UI renders them)
  useEffect(() => {
    if (!effectiveUid || people.length === 0) return;
    const unsubs = [];

    people.forEach((p) => {
      const uq = query(updatesCol(effectiveUid, p.id), orderBy("ts", "desc"));
      const unsubUpdates = onSnapshot(uq, (snap) => {
        const updates = snap.docs.map((d) => ({ id: d.id, ...d.data(), personId: p.id }));
        setUpdatesByPerson((prev) => ({ ...prev, [p.id]: updates }));

        // listen comments per update and merge into updatesByPerson
        updates.forEach((u) => {
          const cq = query(commentsCol(effectiveUid, p.id, u.id), orderBy("ts", "asc"));
          const unsubComments = onSnapshot(cq, (csnap) => {
            const comments = csnap.docs.map((cd) => ({ id: cd.id, ...cd.data() }));
            setUpdatesByPerson((prev) => {
              const list = prev[p.id] || [];
              const merged = list.map((uu) => (uu.id === u.id ? { ...uu, comments } : uu));
              return { ...prev, [p.id]: merged };
            });
          });
          unsubs.push(unsubComments);
        });
      });
      unsubs.push(unsubUpdates);
    });

    return () => unsubs.forEach((fn) => fn && fn());
  }, [effectiveUid, people]);

  // CRUD people (owner only)
  async function savePerson(data, id) {
    if (!effectiveUid || !isOwner) return;
    const payload = {
      ...data,
      ring: data.ring || "medium",
      angleDeg: typeof data.angleDeg === "number" ? data.angleDeg : Math.floor(Math.random() * 360),
      updatedAt: serverTimestamp(),
    };
    if (id) {
      await updateDoc(doc(db, "radars", effectiveUid, "people", id), payload);
    } else {
      await addDoc(peopleCol(effectiveUid), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
  }

  async function deletePerson(personId) {
    if (!effectiveUid || !isOwner) return;
    await deleteDoc(doc(db, "radars", effectiveUid, "people", personId));
  }

  // Updates & comments
  async function addUpdateToPerson(personId, text) {
    if (!isOwner) return;
    if (!text?.trim()) return;
    await addDoc(updatesCol(effectiveUid, personId), {
      text,
      authorUid: auth.currentUser?.uid || "anon",
      ts: serverTimestamp(),
    });
  }

  async function addCommentToUpdate(personId, updateId, text) {
    if (!text?.trim()) return;
    await addDoc(commentsCol(effectiveUid, personId, updateId), {
      text,
      authorUid: auth.currentUser?.uid || "anon",
      ts: serverTimestamp(),
    });
  }

  // UI helpers
  const openAdd = () => {
    setForm({
      name: "",
      age: "",
      description: "",
      ring: "medium",
      photoUrl: "",
      angleDeg: Math.floor(Math.random() * 360),
    });
    setShowAddModal(true);
  };
  const openEdit = (p) => {
    setForm({
      name: p.name || "",
      age: p.age || "",
      description: p.description || "",
      ring: p.ring || "medium",
      photoUrl: p.photoUrl || "",
      angleDeg: typeof p.angleDeg === "number" ? p.angleDeg : Math.floor(Math.random() * 360),
    });
    setEditingId(p.id);
    setShowAddModal(true);
  };
  const closeModal = () => {
    setShowAddModal(false);
    setEditingId(null);
  };

  const submitForm = async () => {
    if (!form.name.trim()) {
      alert("Please enter a name");
      return;
    }
    await savePerson({ ...form, age: form.age ? Number(form.age) : "" }, editingId || null);
    closeModal();
  };

  return (
    <main className="container">
      <header className="subHeader" style={{ width: "100%" }}>
        <div className="profileHeaderRow">
          {onBack ? (
            <button className="btn xs ghost backBtn" onClick={onBack} type="button" aria-label="Back">
              ←
            </button>
          ) : (
            <span />
          )}
          <h2 className="h2" style={{ margin: 0 }}>{headerName}</h2>
          <span />
        </div>
        {!isOwner && friendData?.username && <div className="subtle">@{friendData.username}</div>}
        {isOwner && (
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setShowSettings(true)}>
              Edit Profile
            </button>
          </div>
        )}
      </header>

      {/* Radar card */}
      {radarMode !== "none" && (
        <section className="glass" style={{ padding: 12, marginBottom: 12 }}>
          <div className="row between" style={{ alignItems: "center", marginBottom: 8 }}>
            <div className="h3">{headerName}’s Radar</div>
            {radarMode === "toggle" && (
              <div className="row" style={{ gap: 8 }}>
                <button
                  className={`btn ${animated ? "primary" : "ghost"}`}
                  onClick={() => setAnimated(true)}
                  type="button"
                >
                  Animated
                </button>
                <button
                  className={`btn ${!animated ? "primary" : "ghost"}`}
                  onClick={() => setAnimated(false)}
                  type="button"
                >
                  Static
                </button>
              </div>
            )}
          </div>

          {animated ? <ProfileRadarAnimated size={320} people={people} /> : <ProfileRadarStatic size={320} people={people} />}
        </section>
      )}

      {/* People (master list) */}
      <section className="glass panel" style={{ padding: 12 }}>
        <div className="row between" style={{ alignItems: "center", marginBottom: 8 }}>
          <div className="h3">People</div>
          {isOwner && (
            <button className="btn primary" onClick={openAdd}>
              Add Person
            </button>
          )}
        </div>

        {people.length ? (
          <ul className="list">
            {people.map((p) => (
              <li key={p.id} className="glass" style={{ padding: 10, borderRadius: 10 }}>
                <div className="row between" style={{ alignItems: "center", gap: 10 }}>
                  <div className="row" style={{ alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div className="avatar" data-initial={(p.name || "?")[0].toUpperCase()} />
                    <div>
                      <div className="friendName">{p.name || "Unnamed"}</div>
                      <div className="subtle">
                        {p.ring ? `${p.ring} ring` : "ring ?"} · angle{" "}
                        {typeof p.angleDeg === "number" ? p.angleDeg : "?"}°
                      </div>
                    </div>
                  </div>

                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {!animated && (
                      <button className="btn xs ghost" onClick={() => setSelectedPersonId(p.id)}>
                        Focus
                      </button>
                    )}

                    {isOwner ? (
                      <>
                        <button className="btn xs ghost" onClick={() => openEdit(p)}>
                          Edit
                        </button>
                        <button className="btn xs danger" onClick={() => deletePerson(p.id)}>
                          Delete
                        </button>
                      </>
                    ) : (
                      <button className="btn xs ghost" onClick={() => setDetailsPerson(p)}>
                        See Details
                      </button>
                    )}
                  </div>
                </div>

                {/* Updates + comments */}
                <EditUpdates
                  personId={p.id}
                  updates={updatesByPerson[p.id] || []}
                  commentDrafts={commentDrafts}
                  setCommentDrafts={setCommentDrafts}
                  addUpdateToPerson={addUpdateToPerson}
                  addCommentToUpdate={addCommentToUpdate}
                  canWrite={isOwner}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="subtle">No people yet.</div>
        )}
      </section>

      {/* Add/Edit Modal (owner only) */}
      {showAddModal && isOwner && (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="modalCard glass" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="h3">{editingId ? "Edit Person" : "Add Person"}</div>
              <button className="btn xs ghost" onClick={closeModal}>
                Close
              </button>
            </div>

            <div className="grid" style={{ gap: 8 }}>
              <label className="label">
                <div>Name</div>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jamie"
                />
              </label>

              <label className="label">
                <div>Age (optional)</div>
                <input
                  className="input"
                  type="number"
                  value={form.age}
                  onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                />
              </label>

              <label className="label">
                <div>Description</div>
                <textarea
                  className="input"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>

              <label className="label">
                <div>Ring</div>
                <select
                  className="input"
                  value={form.ring}
                  onChange={(e) => setForm((f) => ({ ...f, ring: e.target.value }))}
                >
                  <option value="inner">inner</option>
                  <option value="medium">medium</option>
                  <option value="outer">outer</option>
                </select>
              </label>

              <label className="label">
                <div>Angle (0–359)</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={359}
                  value={form.angleDeg}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setForm((f) => ({
                      ...f,
                      angleDeg: isNaN(val) ? 0 : Math.max(0, Math.min(359, val)),
                    }));
                  }}
                />
              </label>

              <label className="label">
                <div>Photo URL (optional)</div>
                <input
                  className="input"
                  value={form.photoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </label>
            </div>

            <div className="row right" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn ghost" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn primary" onClick={submitForm}>
                {editingId ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-only details modal (friends) */}
      {detailsPerson && (
        <div className="modalOverlay" onClick={() => setDetailsPerson(null)}>
          <div className="modalCard glass" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="h3">Person Details</div>
              <button className="btn xs ghost" onClick={() => setDetailsPerson(null)}>
                Close
              </button>
            </div>

            <div className="row" style={{ gap: 12, alignItems: "center", marginBottom: 8 }}>
              <div className="avatar" data-initial={(detailsPerson.name || "?")[0].toUpperCase()} />
              <div>
                <div className="friendName" style={{ marginBottom: 2 }}>
                  {detailsPerson.name || "Unnamed"}
                </div>
                <div className="subtle">
                  {(detailsPerson.ring ? `${detailsPerson.ring} ring` : "ring ?")}
                  {" · "}
                  angle {typeof detailsPerson.angleDeg === "number" ? detailsPerson.angleDeg : "?"}°
                </div>
              </div>
            </div>

            {detailsPerson.photoUrl && (
              <img
                src={detailsPerson.photoUrl}
                alt=""
                style={{
                  width: "100%",
                  maxHeight: 240,
                  objectFit: "cover",
                  borderRadius: 10,
                  marginBottom: 10,
                }}
              />
            )}

            <div className="glass" style={{ padding: 10, borderRadius: 10, display: "grid", gap: 6 }}>
              <div>
                <b>Age:</b> {detailsPerson.age || "—"}
              </div>
              <div>
                <b>Description:</b>
                <br />
                {detailsPerson.description || "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal (owner) */}
      {showSettings && isOwner && (
        <div className="modalOverlay" onClick={() => setShowSettings(false)}>
          <div className="modalCard glass" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="h3">Edit Profile</div>
              <button className="btn xs ghost" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </div>

            <label className="label">
              <div>Display name</div>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your display name"
              />
            </label>

            {/* Notifications toggle */}
            <div className="glass" style={{ padding: 10, borderRadius: 10, marginTop: 10 }}>
              <div className="row between" style={{ alignItems: "center" }}>
                <div>
                  <div className="friendName" style={{ fontSize: 14 }}>
                    Notifications
                  </div>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    {notifSupported
                      ? notifPermission === "denied"
                        ? "Blocked in browser settings"
                        : "Enable to get pings for activity"
                      : "Not supported in this browser"}
                  </div>
                </div>

                <button
                  className={`btn xs ${notifEnabled ? "primary" : "ghost"}`}
                  disabled={!notifSupported || notifBusy || notifPermission === "denied"}
                  onClick={toggleNotifications}
                  title={
                    notifPermission === "denied"
                      ? "Notifications are blocked in your browser settings"
                      : notifEnabled
                      ? "Turn off"
                      : "Turn on"
                  }
                >
                  {notifBusy ? "…" : notifEnabled ? "On" : "Off"}
                </button>
              </div>

              {notifPermission === "denied" && (
                <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
                  Notifications are blocked in the browser. To enable: check site settings and
                  allow notifications, then toggle again here.
                </div>
              )}
            </div>

            <div className="row right" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn ghost" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={saving}
                onClick={async () => {
                  try {
                    setSaving(true);
                    await updateProfile(auth.currentUser, { displayName: newName });
                    alert("Display name updated!");
                    setShowSettings(false);
                  } catch (err) {
                    alert(err.message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ----------------- Main App (post-login) ----------------- */
function MainApp({ user }) {
  const meName = deriveNameFromUser(user);

  // tabs: "instruments" | "updates" | "profile" (me) | "instrumentFriend" (someone else)
  const [tab, setTab] = useState("instruments");
  const [selectedProfile, setSelectedProfile] = useState(null);

  useEffect(() => {
    ensureUserDoc(user);
  }, [user]);

  // Dark theme hook
  useEffect(() => {
    document.body.classList.add("theme-dark");
    return () => document.body.classList.remove("theme-dark");
  }, []);

  // Kill any accidental literal text nodes that got rendered to the page
  useEffect(() => {
    const needles = [
      "document.body.classList.add('theme-dark')",
      "document.body.classList.remove('theme-dark')",
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const toRemove = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue || "").trim();
      if (!text) continue;
      if (needles.some((n) => text.includes(n))) {
        toRemove.push(node);
      }
    }
    toRemove.forEach((n) => n.parentNode && n.parentNode.removeChild(n));
  }, []);

  return (
    <>
      {/* INSTRUMENTS (new home) */}
      {tab === "instruments" && (
        <InstrumentsView
          user={user}
          onOpenFriend={(friend) => {
            setSelectedProfile({
              uid: friend.uid,
              displayName: friend.displayName,
              username: friend.username,
            });
            setTab("instrumentFriend");
          }}
        />
      )}

      {/* UPDATES (friend management + notifications) */}
      {tab === "updates" && (
        <FriendsView
          user={user}
          meName={meName}
          onSelectFriend={(friend) => {
            setSelectedProfile({
              uid: friend.uid,
              displayName: friend.displayName,
              username: friend.username,
            });
            setTab("instrumentFriend");
          }}
        />
      )}

      {/* MY PROFILE */}
      {tab === "profile" && (
        <ProfileView key={`profile:me:${user.uid || "me"}`} uid={user.uid} name={meName || user.displayName || user.email || "Me"} />
      )}

      {/* FRIEND'S PROFILE (from Instruments; read-only, back to Instruments) */}
      {tab === "instrumentFriend" && selectedProfile && (
        <ProfileView
          key={`profile:friend:${selectedProfile.uid || "friend"}`}
          uid={selectedProfile.uid}
          name={selectedProfile.displayName || selectedProfile.username || "Friend"}
          onBack={() => setTab("instruments")}
          radarMode="static"
        />
      )}

      {/* NAV */}
      <nav className="nav">
        <button
          className={`navBtn ${tab === "instruments" || tab === "instrumentFriend" ? "active" : ""}`}
          onClick={() => setTab("instruments")}
        >
          <HomeIcon /> <span>Instruments</span>
        </button>
        <button
          className={`navBtn ${tab === "updates" ? "active" : ""}`}
          onClick={() => setTab("updates")}
        >
          <UsersIcon /> <span>Updates</span>
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

/* ----------------- Root App ----------------- */
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <main className="container" style={{ padding: 24 }}>
        <div className="h3">Loading…</div>
      </main>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return <MainApp user={user} />;
}

export default App;
