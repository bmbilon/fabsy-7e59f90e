import { supabase } from "@/integrations/supabase/client";

// IDR tables are introduced by this branch before the generated database types are refreshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const idrDb = supabase as any;
