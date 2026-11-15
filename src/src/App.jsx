
async function handleAuth(e) {
  e.preventDefault();
  setBusy(true);
  setNotice("");

  try {
    if (authMode === "signup") {
      const cleanUsername = username
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");

      if (cleanUsername.length < 3) {
        throw new Error("Username must contain at least 3 valid characters.");
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: displayName.trim() || cleanUsername
          }
        }
      });

      if (error) throw error;

      if (data.user && data.session) {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            id: data.user.id,
            username: cleanUsername,
            display_name: displayName.trim() || cleanUsername,
            bio: ""
          });

        if (profileError) throw profileError;
      }

      setNotice(
        "Account created! Check your email to verify your account before signing in."
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
