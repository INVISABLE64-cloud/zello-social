import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Bell, Bookmark, Check, Compass, Flag, Heart, HelpCircle,
  Home, LogOut, MessageCircle, Moon, Plus, Search, Send, Settings,
  ShieldCheck, Sun, UserRound, Users, X
} from "lucide-react";
import { isConfigured, supabase } from "./lib/supabase";

/*
  ZELLO SOCIAL - upgraded App.jsx

  Existing tables used:
    profiles: id, username, display_name, bio, avatar_url, badge
    posts: id, user_id, content, created_at

  Additional tables needed for the connected features:
    post_likes: id, post_id, user_id, created_at
    comments: id, post_id, user_id, content, created_at
    saved_posts: id, post_id, user_id, created_at
    support_tickets: id, user_id, subject, message, status, created_at
    reports: id, reporter_id, target_type, target_id, reason, details,
             status, created_at

  Run the matching SQL in Supabase before expecting the additional tables
  to work. Admin moderation is intentionally not included in this client
  file; it must be built separately with server-side authorization/RLS.
*/

const NAV_ITEMS = [
  { label: "Home", Icon: Home },
  { label: "Explore", Icon: Compass },
  { label: "Following", Icon: Users },
  { label: "Messages", Icon: MessageCircle },
  { label: "Notifications", Icon: Bell },
  { label: "Saved", Icon: Bookmark },
  { label: "Profile", Icon: UserRound },
  { label: "Support", Icon: HelpCircle },
  { label: "Reports", Icon: Flag },
  { label: "Settings", Icon: Settings }
];

const initials = (name = "ZELLO") =>
  String(name).trim().slice(0, 1).toUpperCase() || "Z";

const prettyDate = (date) => {
  if (!date) return "";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

const errorText = (error) => error?.message || "Something went wrong. Please try again.";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("Home");
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [postText, setPostText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(true);
  const [likes, setLikes] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [supportTickets, setSupportTickets] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState("Harassment or bullying");
  const [reportDetails, setReportDetails] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");

  useEffect(() => {
    if (!isConfigured) return undefined;

    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setNotice(error.message);
      setSession(data?.session || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setPosts([]);
      setLikes([]);
      setSavedPosts([]);
      setComments({});
      setSupportTickets([]);
      setReports([]);
      return;
    }
    loadProfile();
    loadPosts();
    loadUserActivity();
    loadSupportHistory();
    loadReportHistory();
    // These loaders depend on the signed-in user only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) setNotice(errorText(error));
    setProfile(data || null);
  }

  async function loadPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select("id, user_id, content, created_at, profiles(username, display_name, avatar_url, badge)")
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) setNotice(errorText(error));
    setPosts(data || []);
  }

  async function loadUserActivity() {
    const userId = session.user.id;

    const [likeResult, saveResult, commentResult] = await Promise.all([
      supabase.from("post_likes").select("post_id").eq("user_id", userId),
      supabase.from("saved_posts").select("post_id").eq("user_id", userId),
      supabase.from("comments")
        .select("id, post_id, user_id, content, created_at, profiles(username, display_name, badge)")
        .order("created_at", { ascending: true })
        .limit(300)
    ]);

    if (!likeResult.error) setLikes((likeResult.data || []).map((item) => item.post_id));
    if (!saveResult.error) setSavedPosts((saveResult.data || []).map((item) => item.post_id));

    if (!commentResult.error) {
      const grouped = {};
      (commentResult.data || []).forEach((comment) => {
        grouped[comment.post_id] = [...(grouped[comment.post_id] || []), comment];
      });
      setComments(grouped);
    }
  }

  async function loadSupportHistory() {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, subject, message, status, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (!error) setSupportTickets(data || []);
  }

  async function loadReportHistory() {
    const { data, error } = await supabase
      .from("reports")
      .select("id, target_type, reason, details, status, created_at")
      .eq("reporter_id", session.user.id)
      .order("created_at", { ascending: false });

    if (!error) setReports(data || []);
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!isConfigured) return;
    setBusy(true);
    setNotice("");

    try {
      if (authMode === "signup") {
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (cleanUsername.length < 3) throw new Error("Username must contain at least 3 letters or numbers.");

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase.from("profiles").upsert({
            id: data.user.id,
            username: cleanUsername,
            display_name: displayName.trim() || cleanUsername,
            bio: ""
          });
          if (profileError) throw profileError;
        }

        setNotice("Account created. Check your email if confirmation is enabled, then sign in.");
        setAuthMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function createPost(event) {
    event.preventDefault();
    if (!postText.trim()) return;
    setBusy(true);
    setNotice("");

    const { error } = await supabase.from("posts").insert({
      user_id: session.user.id,
      content: postText.trim()
    });

    if (error) {
      setNotice(errorText(error));
    } else {
      setPostText("");
      await loadPosts();
      setNotice("Your post has been published.");
    }
    setBusy(false);
  }

  async function toggleLike(postId) {
    const alreadyLiked = likes.includes(postId);
    setLikes((current) =>
      alreadyLiked ? current.filter((id) => id !== postId) : [...current, postId]
    );

    const result = alreadyLiked
      ? await supabase.from("post_likes").delete()
          .eq("post_id", postId).eq("user_id", session.user.id)
      : await supabase.from("post_likes").insert({
          post_id: postId,
          user_id: session.user.id
        });

    if (result.error) {
      setNotice(errorText(result.error));
      await loadUserActivity();
    }
  }

  async function toggleSave(postId) {
    const alreadySaved = savedPosts.includes(postId);
    setSavedPosts((current) =>
      alreadySaved ? current.filter((id) => id !== postId) : [...current, postId]
    );

    const result = alreadySaved
      ? await supabase.from("saved_posts").delete()
          .eq("post_id", postId).eq("user_id", session.user.id)
      : await supabase.from("saved_posts").insert({
          post_id: postId,
          user_id: session.user.id
        });

    if (result.error) {
      setNotice(errorText(result.error));
      await loadUserActivity();
    }
  }

  async function addComment(postId) {
    const content = (commentDrafts[postId] || "").trim();
    if (!content) return;

    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: session.user.id,
      content
    });

    if (error) {
      setNotice(errorText(error));
      return;
    }

    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    await loadUserActivity();
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!reportTarget) return;
    setBusy(true);

    const { error } = await supabase.from("reports").insert({
      reporter_id: session.user.id,
      target_type: reportTarget.type,
      target_id: reportTarget.id,
      reason: reportReason,
      details: reportDetails.trim(),
      status: "pending"
    });

    if (error) {
      setNotice(errorText(error));
    } else {
      setNotice("Report submitted. Thank you for helping keep ZELLO safe.");
      setReportTarget(null);
      setReportDetails("");
      await loadReportHistory();
    }
    setBusy(false);
  }

  async function submitTicket(event) {
    event.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    setBusy(true);

    const { error } = await supabase.from("support_tickets").insert({
      user_id: session.user.id,
      subject: ticketSubject.trim(),
      message: ticketMessage.trim(),
      status: "open"
    });

    if (error) {
      setNotice(errorText(error));
    } else {
      setTicketSubject("");
      setTicketMessage("");
      setNotice("Your support ticket has been submitted.");
      await loadSupportHistory();
    }
    setBusy(false);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(errorText(error));
    setTab("Home");
  }

  const filteredPosts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let list = posts;

    if (tab === "Saved") list = list.filter((post) => savedPosts.includes(post.id));
    if (tab === "Profile") list = list.filter((post) => post.user_id === session?.user?.id);

    if (term) {
      list = list.filter((post) =>
        (post.content || "").toLowerCase().includes(term) ||
        (post.profiles?.username || "").toLowerCase().includes(term) ||
        (post.profiles?.display_name || "").toLowerCase().includes(term)
      );
    }
    return list;
  }, [posts, searchTerm, tab, savedPosts, session]);

  if (!isConfigured) return <SetupScreen />;

  if (!session) {
    return (
      <>
        <GlobalStyles />
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          username={username}
          setUsername={setUsername}
          displayName={displayName}
          setDisplayName={setDisplayName}
          handleAuth={handleAuth}
          busy={busy}
          notice={notice}
        />
      </>
    );
  }

  return (
    <div className={dark ? "zello-app dark" : "zello-app light"}>
      <GlobalStyles />
      <header className="topbar">
        <button className="brand" onClick={() => setTab("Home")} aria-label="ZELLO home">
          <span className="brand-mark">z</span><span>ZELLO</span>
        </button>

        <div className="top-search">
          <Search size={17} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search posts and people"
            aria-label="Search ZELLO"
          />
          {searchTerm && <button className="clear-search" onClick={() => setSearchTerm("")}><X size={15} /></button>}
        </div>

        <div className="top-actions">
          <button className="icon-btn" title="Toggle theme" onClick={() => setDark((value) => !value)}>
            {dark ? <Sun /> : <Moon />}
          </button>
          <button className="icon-btn" title="Notifications" onClick={() => setTab("Notifications")}><Bell /></button>
          <button className="avatar small" onClick={() => setTab("Profile")} title="Your profile">
            {initials(profile?.display_name || profile?.username)}
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <div className="side-profile">
            <Avatar profile={profile} />
            <div className="side-profile-copy">
              <strong>{profile?.display_name || profile?.username || "Your profile"}</strong>
              <span>@{profile?.username || "username"}</span>
            </div>
          </div>

          <nav className="desktop-nav" aria-label="Main navigation">
            {NAV_ITEMS.map(({ Icon, label }) => (
              <button key={label} className={`nav-item ${tab === label ? "active" : ""}`} onClick={() => setTab(label)}>
                <Icon size={19} />{label}
              </button>
            ))}
          </nav>
          <button className="nav-item logout" onClick={signOut}><LogOut size={19} />Log out</button>
          <div className="sidebar-foot">© 2026 ZELLO SOCIAL</div>
        </aside>

        <main className="feed">
          <div className="mobile-heading">
            <h1>{tab}</h1>
            <button className="icon-btn" onClick={() => setTab("Notifications")} aria-label="Notifications"><Bell /></button>
          </div>

          {tab === "Home" && (
            <>
              <section className="welcome-panel">
                <div>
                  <span className="eyebrow">YOUR SPACE, YOUR PEOPLE</span>
                  <h1>What's happening?</h1>
                  <p>Share a moment with your ZELLO community.</p>
                </div>
                <div className="welcome-orb">z</div>
              </section>
              <Composer
                profile={profile}
                postText={postText}
                setPostText={setPostText}
                createPost={createPost}
                busy={busy}
              />
              <SectionTitle title="Your feed" subtitle="The latest from your community" />
              <PostList
                posts={filteredPosts}
                likes={likes}
                savedPosts={savedPosts}
                comments={comments}
                commentDrafts={commentDrafts}
                setCommentDrafts={setCommentDrafts}
                toggleLike={toggleLike}
                toggleSave={toggleSave}
                addComment={addComment}
                openReport={(type, id) => setReportTarget({ type, id })}
                currentUser={session.user.id}
              />
            </>
          )}

          {tab === "Explore" && (
            <>
              <SectionTitle title="Explore ZELLO" subtitle="Discover conversations and people" />
              <div className="card info-panel">
                <Compass size={30} />
                <h2>Find something interesting</h2>
                <p>Use the search box above to find posts, display names and usernames across the community.</p>
              </div>
              <PostList {...postListProps(filteredPosts, likes, savedPosts, comments, commentDrafts, setCommentDrafts, toggleLike, toggleSave, addComment, setReportTarget, session.user.id)} />
            </>
          )}

          {tab === "Following" && (
            <div className="card info-panel">
              <Users size={30} /><h2>Your community</h2>
              <p>The follow system and following-only feed need a dedicated follows table. This page is ready for that next database stage.</p>
            </div>
          )}

          {tab === "Messages" && (
            <div className="card info-panel">
              <MessageCircle size={30} /><h2>Messages</h2>
              <p>Private chat and voice notes need a secure conversations/messages database setup and storage policies. They are not simulated here.</p>
            </div>
          )}

          {tab === "Notifications" && (
            <div className="card info-panel">
              <Bell size={30} /><h2>Notifications</h2>
              <p>Your notification centre will show activity after the notifications table and event triggers are configured.</p>
            </div>
          )}

          {tab === "Saved" && (
            <>
              <SectionTitle title="Saved posts" subtitle="Posts you've bookmarked" />
              <PostList
                posts={filteredPosts}
                likes={likes}
                savedPosts={savedPosts}
                comments={comments}
                commentDrafts={commentDrafts}
                setCommentDrafts={setCommentDrafts}
                toggleLike={toggleLike}
                toggleSave={toggleSave}
                addComment={addComment}
                openReport={(type, id) => setReportTarget({ type, id })}
                currentUser={session.user.id}
              />
            </>
          )}

          {tab === "Profile" && (
            <>
              <section className="card profile-panel">
                <div className="profile-cover" />
                <div className="profile-info">
                  <Avatar profile={profile} large />
                  <h2>{profile?.display_name || profile?.username || "ZELLO member"}</h2>
                  <p className="muted">@{profile?.username || "username"}</p>
                  <VerificationBadge badge={profile?.badge} />
                  <p>{profile?.bio || "Welcome to my ZELLO profile."}</p>
                </div>
                <div className="profile-stats">
                  <div><strong>{posts.filter((post) => post.user_id === session.user.id).length}</strong><span>Posts</span></div>
                  <div><strong>—</strong><span>Followers</span></div>
                  <div><strong>—</strong><span>Following</span></div>
                </div>
              </section>
              <SectionTitle title="Your posts" subtitle="Everything you've shared" />
              <PostList
                posts={filteredPosts}
                likes={likes}
                savedPosts={savedPosts}
                comments={comments}
                commentDrafts={commentDrafts}
                setCommentDrafts={setCommentDrafts}
                toggleLike={toggleLike}
                toggleSave={toggleSave}
                addComment={addComment}
                openReport={(type, id) => setReportTarget({ type, id })}
                currentUser={session.user.id}
              />
            </>
          )}
                    {tab === "Support" && (
            <>
              <SectionTitle title="Customer support" subtitle="Tell us how we can help" />
              <form className="card form-card" onSubmit={submitTicket}>
                <label>Subject<input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} placeholder="What do you need help with?" maxLength={120} required /></label>
                <label>Message<textarea value={ticketMessage} onChange={(event) => setTicketMessage(event.target.value)} placeholder="Describe the issue. Please don't include your password." maxLength={3000} rows={5} required /></label>
                <button className="primary-btn" disabled={busy || !ticketSubject.trim() || !ticketMessage.trim()}><Send size={16} />Submit ticket</button>
              </form>
              <SectionTitle title="Your support history" subtitle="Check the latest status of your requests" />
              <HistoryList items={supportTickets} empty="You haven't submitted a support ticket yet." type="ticket" />
            </>
          )}

          {tab === "Reports" && (
            <>
              <SectionTitle title="Report history" subtitle="Track reports you've submitted" />
              <HistoryList items={reports} empty="You haven't submitted a report yet." type="report" />
            </>
          )}

          {tab === "Settings" && (
            <section className="card info-panel settings-panel">
              <Settings size={30} /><h2>Settings</h2>
              <p>Manage your session and appearance.</p>
              <button className="secondary-btn" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={17} /> : <Moon size={17} />}{dark ? "Switch to light theme" : "Switch to dark theme"}</button>
              <button className="secondary-btn danger-btn" onClick={signOut}><LogOut size={17} />Log out</button>
            </section>
          )}

          {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={15} /></button></div>}
        </main>

        <aside className="rightbar">
          <section className="card side-card">
            <span className="eyebrow">WELCOME TO</span><h2>ZELLO</h2><p>Connect. Share. Belong.</p>
            <div className="mini-stat"><Users size={17} /><span>Your community starts here.</span></div>
          </section>
          <section className="card side-card">
            <h3>Community guidelines</h3>
            <p>Be respectful, protect your privacy, and share responsibly.</p>
            <div className="guideline"><ShieldCheck size={16} />Keep your account secure</div>
            <div className="guideline"><Heart size={16} />Treat others with respect</div>
            <div className="guideline"><Flag size={16} />Report harmful content</div>
          </section>
          <button className="text-btn" onClick={() => setTab("Support")}>Need help? Contact support <HelpCircle size={15} /></button>
        </aside>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[
          { label: "Home", Icon: Home },
          { label: "Explore", Icon: Compass },
          { label: "Create", Icon: Plus },
          { label: "Messages", Icon: MessageCircle },
          { label: "Profile", Icon: UserRound }
        ].map(({ label, Icon }) => (
          <button key={label} className={tab === label ? "selected" : ""} onClick={() => {
            if (label === "Create") {
              setTab("Home");
              window.setTimeout(() => document.querySelector(".composer textarea")?.focus(), 0);
            } else {
              setTab(label);
            }
          }}>
            <Icon size={21} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {reportTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReportTarget(null);
        }}>
          <form className="card modal-card" onSubmit={submitReport}>
            <div className="modal-head"><h2>Report {reportTarget.type}</h2><button type="button" className="icon-btn" onClick={() => setReportTarget(null)} aria-label="Close"><X /></button></div>
            <p className="muted">Choose the reason that best describes your concern.</p>
            <label>Reason
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                <option>Harassment or bullying</option>
                <option>Hate or abusive content</option>
                <option>Spam or scam</option>
                <option>Impersonation</option>
                <option>Inappropriate content</option>
                <option>Threats or dangerous content</option>
                <option>Other</option>
              </select>
            </label>
            <label>Additional details (optional)
              <textarea rows={4} maxLength={1500} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Share any useful context." />
            </label>
            <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setReportTarget(null)}>Cancel</button><button className="primary-btn" disabled={busy}>Submit report</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function postListProps(posts, likes, savedPosts, comments, commentDrafts, setCommentDrafts, toggleLike, toggleSave, addComment, setReportTarget, currentUser) {
  return {
    posts, likes, savedPosts, comments, commentDrafts, setCommentDrafts,
    toggleLike, toggleSave, addComment,
    openReport: (type, id) => setReportTarget({ type, id }),
    currentUser
  };
}

function Avatar({ profile, large = false }) {
  const name = profile?.display_name || profile?.username || "ZELLO";
  if (profile?.avatar_url) {
    return <img className={`avatar ${large ? "large" : ""}`} src={profile.avatar_url} alt={`${name}'s avatar`} />;
  }
  return <div className={`avatar ${large ? "large" : ""}`}>{initials(name)}</div>;
}

function VerificationBadge({ badge }) {
  if (badge !== "blue" && badge !== "green") return null;
  return (
    <span className={`verification-label ${badge}`}>
      <BadgeCheck size={15} fill="currentColor" />{badge === "blue" ? "Blue verified" : "Green verified"}
    </span>
  );
}

function Composer({ profile, postText, setPostText, createPost, busy }) {
  return (
    <section className="card composer">
      <Avatar profile={profile} />
      <form className="composer-form" onSubmit={createPost}>
        <textarea value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="Write something worth sharing..." maxLength={2000} rows={3} />
        <div className="composer-bottom"><span className="muted">Keep it kind. Keep it ZELLO.</span><button className="primary-btn" disabled={busy || !postText.trim()}><Plus size={17} />Publish</button></div>
      </form>
    </section>
  );
}

function SectionTitle({ title, subtitle }) {
  return <div className="section-title"><div><h2>{title}</h2>{subtitle && <span className="muted">{subtitle}</span>}</div></div>;
}

function PostList({
  posts, likes, savedPosts, comments, commentDrafts, setCommentDrafts,
  toggleLike, toggleSave, addComment, openReport, currentUser
}) {
  if (!posts.length) {
    return <section className="card empty-state"><Compass size={31} /><h2>Nothing here yet</h2><p>When there are posts to show, they'll appear here.</p></section>;
  }

  return (
    <div className="post-list">
      {posts.map((post) => {
        const author = post.profiles || {};
        const postComments = comments[post.id] || [];
        return (
          <article className="card post" key={post.id}>
            <div className="post-head">
              <Avatar profile={author} />
              <div className="post-author">
                <strong>{author.display_name || author.username || "ZELLO member"}<VerificationBadge badge={author.badge} /></strong>
                <span>@{author.username || "user"} · {prettyDate(post.created_at)}</span>
              </div>
              <button className="post-report" title="Report post" onClick={() => openReport("post", post.id)}><Flag size={17} /></button>
            </div>
            <p className="post-content">{post.content}</p>
            <div className="post-actions">
              <button className={likes.includes(post.id) ? "action-active" : ""} onClick={() => toggleLike(post.id)}><Heart size={17} fill={likes.includes(post.id) ? "currentColor" : "none"} />Like</button>
              <button onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}><MessageCircle size={17} />Comment</button>
              <button className={savedPosts.includes(post.id) ? "action-active" : ""} onClick={() => toggleSave(post.id)}><Bookmark size={17} fill={savedPosts.includes(post.id) ? "currentColor" : "none"} />{savedPosts.includes(post.id) ? "Saved" : "Save"}</button>
              {post.user_id !== currentUser && <button onClick={() => openReport("user", post.user_id)}><Flag size={17} />Report user</button>}
            </div>
            {postComments.length > 0 && (
              <div className="comments-list">
                {postComments.map((comment) => (
                  <div className="comment" key={comment.id}>
                    <strong>{comment.profiles?.display_name || comment.profiles?.username || "ZELLO member"}</strong>
                    <span>{comment.content}</span>
                  </div>
                ))}
              </div>
            )}
            <form className="comment-form" onSubmit={(event) => { event.preventDefault(); addComment(post.id); }}>
              <input id={`comment-${post.id}`} value={commentDrafts[post.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Write a comment..." maxLength={1000} />
              <button className="icon-btn" disabled={!(commentDrafts[post.id] || "").trim()} aria-label="Send comment"><Send size={17} /></button>
            </form>
          </article>
        );
      })}
    </div>
  );
}

function HistoryList({ items, empty, type }) {
  if (!items.length) return <div className="card empty-state"><ShieldCheck size={29} /><p>{empty}</p></div>;
  return (
    <div className="history-list">
      {items.map((item) => (
        <article className="card history-item" key={item.id}>
          <div><strong>{type === "ticket" ? item.subject : `${item.target_type} report`}</strong><p>{type === "ticket" ? item.message : item.reason}</p><span className="muted">{prettyDate(item.created_at)}</span></div>
          <span className={`status-pill ${(item.status || "pending").toLowerCase()}`}>{item.status || "pending"}</span>
        </article>
      ))}
    </div>
  );
}

function AuthScreen(props) {
  const {
    authMode, setAuthMode, email, setEmail, password, setPassword,
    username, setUsername, displayName, setDisplayName, handleAuth, busy, notice
  } = props;

  return (
    <div className="auth-page">
      <GlobalStyles />
      <div className="auth-decoration decor-one" /><div className="auth-decoration decor-two" />
      <div className="auth-brand"><span className="brand-mark">z</span><span>ZELLO</span></div>
      <div className="auth-card">
        <span className="eyebrow">CONNECT. SHARE. BELONG.</span>
        <h1>{authMode === "login" ? "Welcome back." : "Join your people."}</h1>
        <p className="muted">A fresh space for your community.</p>
        <form onSubmit={handleAuth} className="auth-form">
          {authMode === "signup" && <>
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" maxLength={60} required /></label>
            <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="choose_a_username" minLength={3} maxLength={24} required /></label>
          </>}
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required /></label>
          <button className="primary-btn full" disabled={busy}>{busy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <p className="switch-auth">{authMode === "login" ? "New to ZELLO?" : "Already have an account?"}<button onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Create account" : "Sign in"}</button></p>
      </div>
      <p className="auth-footer">Use ZELLO respectfully and protect your account information.</p>
    </div>
  );
}

function SetupScreen() {
  return (
    <>
      <GlobalStyles />
      <div className="setup-page">
        <div className="auth-brand"><span className="brand-mark">z</span><span>ZELLO</span></div>
        <div className="auth-card">
          <span className="eyebrow">ONE QUICK SETUP</span>
          <h1>Connect your ZELLO database.</h1>
          <p className="muted">Add your Supabase project URL and publishable (or anon) key to your environment file, then restart the app.</p>
          <p className="setup-hint">For Vite, the variables are usually named <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. Keep secret service-role keys out of the browser.</p>
        </div>
      </div>
    </>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap');
      *{box-sizing:border-box} body{margin:0;font-family:'DM Sans',sans-serif} button,input,textarea,select{font:inherit} button{cursor:pointer}
      .zello-app,.auth-page,.setup-page{--bg:#090f1c;--panel:#111b2d;--panel2:#17243a;--text:#f4f7fc;--muted:#91a0b8;--line:#26354c;--blue:#3978ff;--green:#20b978;min-height:100vh;background:var(--bg);color:var(--text)}
      .zello-app.light,.auth-page.light,.setup-page.light{--bg:#f2f5fa;--panel:#fff;--panel2:#f6f8fc;--text:#172033;--muted:#68758b;--line:#e1e7f0;--blue:#2865e8;--green:#159b61}
      .zello-app{background:var(--bg);color:var(--text);padding-bottom:76px}.topbar{height:72px;position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:28px;padding:0 max(22px,calc((100vw - 1440px)/2));background:var(--panel);border-bottom:1px solid var(--line)}
      .brand,.auth-brand{display:flex;align-items:center;gap:10px;font:800 21px 'Space Grotesk';letter-spacing:1.5px;color:var(--text);background:none;border:0}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg,#3978ff,#21c58b);color:white;font:800 25px 'Space Grotesk';letter-spacing:0}
      .top-search{display:flex;align-items:center;gap:10px;width:min(440px,45vw);padding:0 14px;height:42px;border:1px solid var(--line);border-radius:13px;background:var(--panel2);color:var(--muted);margin:auto}.top-search input{width:100%;border:0;outline:0;background:transparent;color:var(--text)}.clear-search{border:0;background:none;color:var(--muted);display:grid;place-items:center}
      .top-actions{display:flex;align-items:center;gap:12px}.icon-btn{display:grid;place-items:center;width:40px;height:40px;border:1px solid var(--line);border-radius:12px;background:var(--panel2);color:var(--text)}.icon-btn svg{width:19px;height:19px}
      .app-layout{max-width:1440px;margin:auto;padding:28px 24px;display:grid;grid-template-columns:235px minmax(0,680px) 260px;gap:26px;justify-content:center}.sidebar{position:sticky;top:96px;align-self:start;min-height:calc(100vh - 120px);display:flex;flex-direction:column}.side-profile{display:flex;align-items:center;gap:11px;padding:10px 8px 22px;border-bottom:1px solid var(--line);margin-bottom:14px}.side-profile-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.side-profile-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.side-profile-copy span,.post-author span{font-size:12px;color:var(--muted)}
      .avatar{width:42px;height:42px;flex:none;display:grid;place-items:center;border-radius:50%;background:linear-gradient(135deg,#3978ff,#22bd91);color:#fff;font-weight:800;object-fit:cover}.avatar.small{width:38px;height:38px;border:0}.avatar.large{width:88px;height:88px;border:5px solid var(--panel);font-size:27px}
      .desktop-nav{display:grid;gap:5px}.nav-item{display:flex;align-items:center;gap:13px;width:100%;padding:12px 13px;border:0;border-radius:12px;background:transparent;color:var(--muted);text-align:left;font-weight:600}.nav-item:hover,.nav-item.active{background:var(--panel2);color:var(--blue)}.logout{margin-top:12px}.sidebar-foot{margin-top:auto;padding:22px 8px;color:var(--muted);font-size:11px}
      .feed{min-width:0}.mobile-heading{display:none}.welcome-panel{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;padding:28px 30px;border:1px solid #294b83;border-radius:20px;background:linear-gradient(120deg,#142c50,#12243b 65%,#153e48);margin-bottom:18px}.eyebrow{font-size:10px;letter-spacing:1.7px;font-weight:800;color:#62a0ff}.welcome-panel h1{font:700 27px 'Space Grotesk';margin:9px 0 5px}.welcome-panel p{margin:0;color:#b7c8df;font-size:14px}.welcome-orb{display:grid;place-items:center;width:86px;height:86px;border-radius:28px;transform:rotate(12deg);background:linear-gradient(135deg,#3978ff,#21c58b);font:800 65px 'Space Grotesk';color:white;box-shadow:0 12px 35px #0004}
      .card{background:var(--panel);border:1px solid var(--line);border-radius:17px}.composer{display:flex;gap:13px;padding:18px;margin-bottom:26px}.composer-form{flex:1;min-width:0}.composer textarea,.form-card textarea,.modal-card textarea{width:100%;resize:vertical;min-height:75px;border:0;outline:0;background:transparent;color:var(--text);padding:9px 2px}.composer textarea::placeholder,input::placeholder,textarea::placeholder{color:var(--muted)}.composer-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:12px}.muted{color:var(--muted);font-size:12px}.primary-btn,.secondary-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border:0;border-radius:11px;font-weight:700}.primary-btn{background:var(--blue);color:white}.primary-btn:disabled{opacity:.5;cursor:not-allowed}.secondary-btn{background:var(--panel2);border:1px solid var(--line);color:var(--text)}.full{width:100%;padding:13px}
      .section-title{display:flex;align-items:center;justify-content:space-between;margin:24px 2px 13px}.section-title h2{font:700 19px 'Space Grotesk';margin:0 0 3px}.post-list{display:grid;gap:14px}.post{padding:18px}.post-head{display:flex;align-items:center;gap:11px}.post-author{display:grid;gap:4px;min-width:0;flex:1}.post-author strong{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.post-report{border:0;background:transparent;color:var(--muted);padding:8px}.post-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;margin:18px 0}.post-actions{display:flex;flex-wrap:wrap;gap:7px;border-top:1px solid var(--line);padding-top:10px}.post-actions button{display:flex;align-items:center;gap:7px;border:0;border-radius:9px;background:transparent;color:var(--muted);padding:8px 10px;font-size:12px;font-weight:700}.post-actions button:hover,.post-actions .action-active{background:var(--panel2);color:var(--blue)}
      .verification-label{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;border-radius:20px;padding:4px 7px}.verification-label.blue{color:#4e91ff;background:#3978ff1c}.verification-label.green{color:#22bd80;background:#20b9781c}.comments-list{display:grid;gap:8px;margin-top:12px}.comment{display:flex;gap:8px;align-items:baseline;background:var(--panel2);padding:9px 11px;border-radius:10px;font-size:12px}.comment strong{white-space:nowrap}.comment span{overflow-wrap:anywhere}.comment-form{display:flex;align-items:center;gap:8px;margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:4px 6px 4px 12px}.comment-form input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);padding:8px 0}.comment-form .icon-btn{width:34px;height:34px}
      .rightbar{display:grid;align-content:start;gap:14px}.side-card{padding:19px}.side-card h2{font:800 24px 'Space Grotesk';margin:9px 0 2px}.side-card h3{margin:0 0 10px;font:700 15px 'Space Grotesk'}.side-card p{color:var(--muted);font-size:13px;line-height:1.55}.mini-stat,.guideline{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px;margin-top:13px}.guideline svg,.mini-stat svg{color:var(--blue)}.text-btn{display:flex;align-items:center;justify-content:center;gap:8px;border:0;background:transparent;color:var(--blue);font-weight:700;padding:10px}
      .info-panel,.empty-state{padding:34px 25px;text-align:center;display:grid;justify-items:center;gap:10px}.info-panel>svg,.empty-state>svg{color:var(--blue)}.info-panel h2,.empty-state h2{font:700 19px 'Space Grotesk';margin:3px 0}.info-panel p,.empty-state p{max-width:440px;color:var(--muted);font-size:13px;line-height:1.6;margin:0}.profile-panel{overflow:hidden}.profile-cover{height:125px;background:linear-gradient(120deg,#1b4e91,#226d70,#1c294b)}.profile-info{padding:0 22px 18px;margin-top:-43px}.profile-info h2{font:700 22px 'Space Grotesk';margin:10px 0 3px}.profile-info p{line-height:1.5}.profile-stats{display:flex;justify-content:space-around;border-top:1px solid var(--line);padding:16px}.profile-stats div{display:grid;text-align:center;gap:3px}.profile-stats strong{font:700 19px 'Space Grotesk'}.profile-stats span{font-size:11px;color:var(--muted)}
      .form-card{padding:20px;display:grid;gap:15px}.form-card label,.modal-card label,.auth-form label{display:grid;gap:8px;font-size:12px;font-weight:700;color:var(--muted)}.form-card input,.form-card textarea,.modal-card select,.modal-card textarea{border:1px solid var(--line);border-radius:10px;background:var(--panel2);color:var(--text);padding:12px;outline:0}.form-card textarea,.modal-card textarea{min-height:110px}.history-list{display:grid;gap:10px}.history-item{padding:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.history-item p{font-size:13px;color:var(--muted);line-height:1.5}.status-pill{flex:none;padding:5px 9px;border-radius:30px;background:#d99b241c;color:#dba83d;font-size:10px;font-weight:800;text-transform:capitalize}.status-pill.resolved,.status-pill.closed{background:#20b9781c;color:#20b978}.status-pill.reviewing,.status-pill.in_progress{background:#3978ff1c;color:#5791ff}
      .toast{position:fixed;z-index:40;bottom:25px;left:50%;transform:translateX(-50%);max-width:min(90vw,520px);display:flex;align-items:center;gap:15px;padding:12px 15px;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:0 10px 35px #0003;font-size:13px}.toast button{border:0;background:transparent;color:var(--muted)}
      .mobile-nav{display:none}.modal-backdrop{position:fixed;inset:0;z-index:50;background:#020713bb;display:grid;place-items:center;padding:18px}.modal-card{width:min(100%,470px);padding:20px;display:grid;gap:15px;box-shadow:0 20px 70px #0007}.modal-head{display:flex;align-items:center;justify-content:space-between}.modal-head h2{font:700 20px 'Space Grotesk';margin:0}.modal-actions{display:flex;justify-content:flex-end;gap:9px}
      .auth-page,.setup-page{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 18px}.auth-brand{margin-bottom:25px}.auth-card{position:relative;z-index:1;width:min(100%,440px);padding:30px;background:var(--panel);border:1px solid var(--line);border-radius:22px;box-shadow:0 20px 70px #0003}.auth-card h1{font:700 30px 'Space Grotesk';margin:10px 0 5px}.auth-card>p{margin-top:0}.auth-form{display:grid;gap:16px;margin-top:24px}.auth-form input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);color:var(--text);outline:0}.switch-auth{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:20px 0 0;font-size:12px;color:var(--muted)}.switch-auth button{border:0;background:transparent;color:var(--blue);font-weight:800}.form-notice{padding:10px;border-radius:9px;background:var(--panel2);font-size:12px}.auth-footer{color:var(--muted);font-size:11px;margin-top:22px;text-align:center}.auth-decoration{position:absolute;width:300px;height:300px;border-radius:50%;filter:blur(80px);opacity:.2;background:#3978ff}.decor-one{top:-120px;left:-90px}.decor-two{bottom:-130px;right:-90px;background:#20b978}.setup-hint{padding:12px;border-radius:10px;background:var(--panel2);font-size:12px;line-height:1.6;color:var(--muted)}code{color:var(--blue)}
      @media(max-width:1120px){.app-layout{grid-template-columns:205px minmax(0,680px);max-width:950px}.rightbar{display:none}}
      @media(max-width:700px){.topbar{height:62px;padding:0 14px;gap:12px}.brand{font-size:17px;gap:7px}.brand-mark{width:30px;height:30px}.top-search{width:auto;flex:1;height:38px;margin:0}.top-search input{font-size:12px}.top-actions{gap:6px}.top-actions .icon-btn{width:35px;height:35px}.top-actions .avatar{width:34px;height:34px}.app-layout{display:block;padding:16px 12px 22px}.sidebar{display:none}.feed{width:100%}.mobile-heading{display:flex;align-items:center;justify-content:space-between;margin:0 2px 15px}.mobile-heading h1{font:700 22px 'Space Grotesk';margin:0}.welcome-panel{padding:22px 18px;border-radius:16px}.welcome-panel h1{font-size:22px}.welcome-orb{width:60px;height:60px;border-radius:20px;font-size:45px}.composer{padding:13px;gap:9px}.composer .avatar{width:35px;height:35px}.composer-bottom{align-items:flex-end}.composer-bottom .muted{max-width:130px;font-size:10px}.primary-btn{padding:10px 12px;font-size:12px}.post{padding:14px}.post-content{font-size:14px}.post-actions{gap:1px}.post-actions button{padding:8px 7px;font-size:11px}.mobile-nav{position:fixed;z-index:30;bottom:0;left:0;right:0;display:flex;justify-content:space-around;align-items:center;height:67px;padding-bottom:env(safe-area-inset-bottom);background:var(--panel);border-top:1px solid var(--line)}.mobile-nav button{display:grid;justify-items:center;gap:3px;min-width:52px;border:0;background:transparent;color:var(--muted);font-size:10px}.mobile-nav button.selected{color:var(--blue)}.mobile-nav button:nth-child(3) svg{width:27px;height:27px;padding:4px;border-radius:9px;background:var(--blue);color:white}.toast{bottom:78px}.auth-card{padding:23px}.auth-card h1{font-size:26px}.profile-info{padding-left:16px;padding-right:16px}.history-item{padding:13px}.modal-card{padding:16px}}
      @media(prefers-reduced-motion:no-preference){button,.card{transition:background .15s ease,border-color .15s ease,transform .15s ease}.post:hover{border-color:#3978ff55}}
    `}</style>
  );
}
