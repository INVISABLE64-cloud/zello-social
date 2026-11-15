
import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Bell, Bookmark, Camera, Check, Compass, Heart, Home,
  ImagePlus, LogOut, MessageCircle, Moon, Plus, Search, Send, Settings,
  ShieldCheck, Sun, UserRound, Users, Video, X
} from "lucide-react";
import { isConfigured, supabase } from "./lib/supabase";

const initials = (name = "Z") => name.trim().slice(0, 1).toUpperCase();

const prettyDate = (date) =>
  new Date(date).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });

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

  useEffect(() => {
    if (!isConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => setSession(next)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setPosts([]);
      return;
    }

    loadProfile();
    loadPosts();
  }, [session]);

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) setNotice(error.message);
    setProfile(data);
  }

  async function loadPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select("id, user_id, content, created_at, profiles(username, display_name, avatar_url, badge)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) setNotice(error.message);
    setPosts(data || []);
  }

  async function handleAuth(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              id: data.user.id,
              username: username.toLowerCase().replace(/[^a-z0-9_]/g, ""),
              display_name: displayName || username,
              bio: ""
            });

          if (profileError) throw profileError;
        }

        setNotice(
          "Account created. Check your email if confirmation is enabled, then sign in."
        );
        setAuthMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
      }
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createPost(e) {
    e.preventDefault();

    if (!postText.trim()) return;

    setBusy(true);
    setNotice("");

    const { error } = await supabase.from("posts").insert({
      user_id: session.user.id,
      content: postText.trim()
    });

    if (error) {
      setNotice(error.message);
    } else {
      setPostText("");
      await loadPosts();
    }

    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTab("Home");
  }

  const filteredPosts = useMemo(
    () =>
      posts.filter(
        (p) =>
          (p.content || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.profiles?.username || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      ),
    [posts, searchTerm]
  );

  if (!isConfigured) return <SetupScreen />;

  if (!session) {
    return (
      <AuthScreen
        {...{
          authMode,
          setAuthMode,
          email,
          setEmail,
          password,
          setPassword,
          username,
          setUsername,
          displayName,
          setDisplayName,
          handleAuth,
          busy,
          notice
        }}
      />
    );
  }

  return (
    <div className={dark ? "app dark" : "app light"}>
      <header className="topbar">
        <button className="brand" onClick={() => setTab("Home")}>
          <span className="brand-mark">z</span>
          <span>ZELLO</span>
        </button>

        <div className="top-search">
          <Search size={17} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search ZELLO"
          />
        </div>

        <div className="top-actions">
          <button
            className="icon-btn"
            title="Toggle theme"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun /> : <Moon />}
          </button>

          <button
            className="icon-btn"
            title="Notifications"
            onClick={() => setTab("Notifications")}
          >
            <Bell />
          </button>

          <button
            className="avatar small"
            onClick={() => setTab("Profile")}
          >
            {initials(profile?.display_name || profile?.username)}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="side-profile">
            <div className="avatar">
              {initials(profile?.display_name || profile?.username)}
            </div>
            <div>
              <strong>
                {profile?.display_name || profile?.username || "Your profile"}
              </strong>
              <span>@{profile?.username || "username"}</span>
            </div>
          </div>

          {[
            [Home, "Home"],
            [Compass, "Explore"],
            [Users, "Following"],
            [MessageCircle, "Messages"],
            [Bell, "Notifications"],
            [Bookmark, "Saved"],
            [UserRound, "Profile"],
            [Settings, "Settings"]
          ].map(([Icon, label]) => (
            <button
              key={label}
              className={`nav-item ${tab === label ? "active" : ""}`}
              onClick={() => setTab(label)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}

          <button className="nav-item logout" onClick={signOut}>
            <LogOut size={19} />
            Log out
          </button>

          <div className="sidebar-foot">© 2026 ZELLO</div>
        </aside>

        <main className="feed">
          <div className="mobile-heading">
            <h1>{tab}</h1>
            <button
              className="icon-btn"
              onClick={() => setTab("Notifications")}
            >
              <Bell />
            </button>
          </div>

          {tab === "Home" && (
            <>
              <section className="welcome">
                <div>
                  <span className="eyebrow">YOUR SPACE, YOUR PEOPLE</span>
                  <h1>What's happening?</h1>
                  <p>Share a moment with your ZELLO community.</p>
                </div>
                <div className="welcome-orb">z</div>
              </section>

              <section className="composer card">
                <div className="avatar">
                  {initials(profile?.display_name || profile?.username)}
                </div>

                <form onSubmit={createPost} className="composer-form">
                  <textarea
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    placeholder="Write something worth sharing..."
                    maxLength={2000}
                  />

                  <div className="composer-bottom">
                    <span className="muted">
                      Keep it kind. Keep it ZELLO.
                    </span>
                    <button
                      className="primary-btn"
                      disabled={busy || !postText.trim()}
                    >
                      <Plus size={17} />
                      Publish
                    </button>
                  </div>
                </form>
              </section>

              <div className="section-title">
                <h2>Your feed</h2>
                <span className="muted">Latest posts</span>
              </div>

              <PostList
                posts={filteredPosts}
                currentUser={session.user.id}
              />
            </>
          )}

          {tab === "Explore" && (
            <section className="card empty-state">
              <Compass size={32} />
              <h2>Discover ZELLO</h2>
              <p>
                Search posts and usernames using the search box above.
                More discovery tools are coming next.
              </p>
            </section>
          )}

          {tab === "Following" && (
            <section className="card empty-state">
              <Users size={32} />
              <h2>Your community</h2>
              <p>
                Following lists will appear here after we add the follow system.
              </p>
            </section>
          )}

          {tab === "Messages" && (
            <section className="card empty-state">
              <MessageCircle size={32} />
              <h2>Your messages</h2>
              <p>
                Private chat and voice notes are in the next development stage.
              </p>
            </section>
          )}

          {tab === "Notifications" && (
            <section className="card empty-state">
              <Bell size={32} />
              <h2>Notifications</h2>
              <p>
                Your activity notifications will appear here once that feature
                is connected.
              </p>
            </section>
          )}

          {tab === "Saved" && (
            <section className="card empty-state">
              <Bookmark size={32} />
              <h2>Saved posts</h2>
              <p>
                Save posts to find them here. The save feature is coming next.
              </p>
            </section>
          )}

          {tab === "Profile" && (
            <section className="card profile-panel">
              <div className="profile-cover" />
              <div className="profile-info">
                <div className="avatar large">
                  {initials(profile?.display_name || profile?.username)}
                </div>

                <h2>{profile?.display_name || profile?.username}</h2>
                <p className="muted">@{profile?.username}</p>

                {profile?.badge && (
                  <span className="badge-label">
                    <BadgeCheck size={15} />
                    {profile.badge} verified
                  </span>
                )}

                <p>{profile?.bio || "Welcome to my ZELLO profile."}</p>
              </div>

              <div className="profile-stats">
                <div>
                  <strong>
                    {posts.filter((p) => p.user_id === session.user.id).length}
                  </strong>
                  <span>Posts</span>
                </div>
                <div>
                  <strong>—</strong>
                  <span>Followers</span>
                </div>
                <div>
                  <strong>—</strong>
                  <span>Following</span>
                </div>
              </div>
            </section>
          )}

          {tab === "Settings" && (
            <section className="card empty-state">
              <Settings size={32} />
              <h2>Settings</h2>
              <p>
                Profile editing, privacy and account controls will be added in
                the next stage.
              </p>
              <button className="secondary-btn" onClick={signOut}>
                <LogOut size={16} />
                Log out
              </button>
            </section>
          )}

          {notice && (
            <div className="toast" role="status">
              {notice}
              <button onClick={() => setNotice("")}>
                <X size={15} />
              </button>
            </div>
          )}
        </main>

        <aside className="rightbar">
          <section className="card side-card">
            <span className="eyebrow">WELCOME TO</span>
            <h2>ZELLO</h2>
            <p>Connect. Share. Belong.</p>
            <div className="mini-stat">
              <Users size={17} />
              <span>Your community starts here.</span>
            </div>
          </section>

          <section className="card side-card">
            <h3>Community guidelines</h3>
            <p>
              Be respectful, protect your privacy, and share responsibly.
            </p>
            <div className="guideline">
              <ShieldCheck size={16} />
              Keep your account secure
            </div>
            <div className="guideline">
              <Heart size={16} />
              Treat others with respect
            </div>
          </section>

          <button
            className="text-btn"
            onClick={() => setTab("Settings")}
          >
            Account settings <Settings size={15} />
          </button>
        </aside>
      </div>

      <nav className="mobile-nav">
        {[
          [Home, "Home"],
          [Compass, "Explore"],
          [Plus, "Create"],
          [MessageCircle, "Messages"],
          [UserRound, "Profile"]
        ].map(([Icon, label]) => (
          <button
            key={label}
            className={tab === label ? "selected" : ""}
            onClick={() =>
              label === "Create"
                ? document.querySelector("textarea")?.focus()
                : setTab(label)
            }
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {notice && (
        <div className="toast mobile-toast" role="status">
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function PostList({ posts, currentUser }) {
  if (!posts.length) {
    return (
      <section className="card empty-state">
        <ImagePlus size={32} />
        <h2>Your feed is waiting</h2>
        <p>Be the first to share something with your community.</p>
      </section>
    );
  }

  return (
    <div className="post-list">
      {posts.map((post) => (
        <article className="card post" key={post.id}>
          <div className="post-head">
            <div className="avatar">
              {initials(
                post.profiles?.display_name || post.profiles?.username
              )}
            </div>

            <div className="post-author">
              <strong>
                {post.profiles?.display_name ||
                  post.profiles?.username ||
                  "ZELLO user"}

                {post.profiles?.badge === "blue" && (
                  <BadgeCheck className="blue-tick" size={16} />
                )}

                {post.profiles?.badge === "green" && (
                  <BadgeCheck className="green-tick" size={16} />
                )}
              </strong>

              <span>
                @{post.profiles?.username || "user"} ·{" "}
                {prettyDate(post.created_at)}
              </span>
            </div>
          </div>

          <p className="post-content">{post.content}</p>

          <div className="post-actions">
            <button disabled>
              <Heart size={17} /> Like
            </button>
            <button disabled>
              <MessageCircle size={17} /> Comment
            </button>
            <button disabled>
              <Send size={17} /> Share
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function AuthScreen(props) {
  const {
    authMode,
    setAuthMode,
    email,
    setEmail,
    password,
    setPassword,
    username,
    setUsername,
    displayName,
    setDisplayName,
    handleAuth,
    busy,
    notice
  } = props;

  return (
    <div className="auth-page">
      <div className="auth-decoration decor-one" />
      <div className="auth-decoration decor-two" />

      <div className="auth-brand">
        <span className="brand-mark">z</span>
        <span>ZELLO</span>
      </div>

      <div className="auth-card">
        <span className="eyebrow">CONNECT. SHARE. BELONG.</span>
        <h1>
          {authMode === "login" ? "Welcome back." : "Join your people."}
        </h1>
        <p className="muted">A fresh space for your community.</p>

        <form onSubmit={handleAuth} className="auth-form">
          {authMode === "signup" && (
            <>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </label>

              <label>
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="choose_a_username"
                  minLength={3}
                  required
                />
              </label>
            </>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>

          <button className="primary-btn full" disabled={busy}>
            {busy
              ? "Please wait..."
              : authMode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        {notice && <p className="form-notice">{notice}</p>}

        <p className="switch-auth">
          {authMode === "login"
            ? "New to ZELLO?"
            : "Already have an account?"}

          <button
            onClick={() =>
              setAuthMode(authMode === "login" ? "signup" : "login")
            }
          >
            {authMode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>

      <p className="auth-footer">
        By continuing, you agree to use ZELLO respectfully and safely.
      </p>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="setup-page">
      <div className="auth-brand">
        <span className="brand-mark">z</span>
        <span>ZELLO</span>
      </div>

      <div className="auth-card">
        <span className="eyebrow">ONE QUICK SETUP</span>
        <h1>Connect your ZELLO database.</h1>

        <p className="muted">
          Add your Supabase project URL and publishable (or anon) key to the
          environment file, then restart the app.
        </p>

        <ol>
          
