import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ouuhdxncyvfxgbktpane.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91dWhkeG5jeXZmeGdia3RwYW5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDI0MDMsImV4cCI6MjA4NjAxODQwM30.GYwuUNoSJHzgTwlXzZYvVNxN02lSl0V2ZmbX7doKgJE";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
