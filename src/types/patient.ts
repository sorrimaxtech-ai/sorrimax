export type ColumnId = string;

export interface Patient {
  id: string;
  name: string;
  age?: number;
  service?: string;
  status: ColumnId; // Matches the Column ID (stage_id)
  date?: string;
  time?: string;
  avatar?: string;
  priority?: "low" | "medium" | "high";
  phone?: string;
  notes?: string;
  value?: string;
  healthPlan?: string;
  email?: string; // Added
  origin?: string; // Added
  db_stage_id?: string; // To track the actual UUID of the stage
  tags?: string[]; // Added for tagging system
  unread_messages?: number;
  last_message_at?: string;
}

export interface Column {
  id: ColumnId;
  title: string;
  patients: Patient[];
  color: string;
  order?: number;
}
