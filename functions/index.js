// functions/index.js (Gen-1, works today)
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const msg = admin.messaging();

async function getFriendsOf(uid) {
  const qs = await db.collection("friendships")
    .where("members", "array-contains", uid)
    .get();
  const s = new Set();
  qs.forEach((d) => {
    const mem = d.data().members || [];
    const other = mem.find((x) => x !== uid);
    if (other) s.add(other);
  });
  return [...s];
}

async function tokensFor(uids, exclude = []) {
  const set = new Set(uids.filter((u) => !exclude.includes(u)));
  const tokens = [];
  await Promise.all(
    [...set].map(async (uid) => {
      const qs = await db.collection("users").doc(uid).collection("tokens").get();
      qs.forEach((d) => tokens.push(d.id)); // doc id is the token
    })
  );
  return tokens;
}

async function sendToTokens(tokens, title, body, data = {}) {
  if (!tokens.length) return;
  await msg.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data, // strings only
  });
}

// Person added
exports.notifyPersonAdded = functions
  .region("us-central1")
  .firestore.document("radars/{ownerUid}/people/{personId}")
  .onCreate(async (snap, context) => {
    const { ownerUid, personId } = context.params;
    const p = snap.data();
    const personName = p?.name || "Someone";

    const friendUids = await getFriendsOf(ownerUid);
    const tokens = await tokensFor(friendUids);
    await sendToTokens(
      tokens,
      "New person on the radar",
      `Your friend added ${personName} to their radar`,
      { url: "/friends", type: "person", ownerUid, personId }
    );
  });

// Update posted
exports.notifyUpdatePosted = functions
  .region("us-central1")
  .firestore.document("radars/{ownerUid}/people/{personId}/updates/{updateId}")
  .onCreate(async (snap, context) => {
    const { ownerUid, personId } = context.params;
    const friendUids = await getFriendsOf(ownerUid);
    const tokens = await tokensFor(friendUids);
    await sendToTokens(
      tokens,
      "New radar update",
      `Your friend posted a new update`,
      { url: "/friends", type: "update", ownerUid, personId }
    );
  });

// Comment created
exports.notifyCommentCreated = functions
  .region("us-central1")
  .firestore.document("radars/{ownerUid}/people/{personId}/updates/{updateId}/comments/{commentId}")
  .onCreate(async (snap, context) => {
    const { ownerUid, personId, updateId } = context.params;
    const c = snap.data();
    const authorUid = c?.authorUid || "anon";

    // notify owner + their friends (not the author)
    const friendUids = await getFriendsOf(ownerUid);
    const audience = new Set([ownerUid, ...friendUids]);
    const tokens = await tokensFor([...audience], [authorUid]);

    await sendToTokens(
      tokens,
      "New comment",
      "Someone commented on a radar update",
      { url: "/friends", type: "comment", ownerUid, personId, updateId }
    );
  });
