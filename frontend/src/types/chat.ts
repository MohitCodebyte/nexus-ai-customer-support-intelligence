export type MascotState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'confused';

export interface IntentCandidate {
  intent: string;
  score: number;
}

export interface IntentPrediction {
  intent: string;
  category: string;
  confidence: number;
  score_type?: 'calibrated_probability' | 'uncalibrated_decision_score' | string;
  model?: string;
  decision_margin?: number;
  review_required: boolean;
  status: string;
  top_candidates?: IntentCandidate[];
}

export interface RetrievalSource {
  doc_id?: string | number;
  intent?: string;
  category?: string;
  question?: string;
  answer?: string;
  similarity_score?: number;
  source?: string;
}

export type SupportedLanguage = 'auto' | 'en' | 'hi' | 'hinglish';

export type VoiceInputStatus =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'processing'
  | 'error';

export interface VoiceInputState {
  status: VoiceInputStatus;
  isSupported: boolean;
  transcript: string;
  errorMessage: string | null;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string;
  custom_title?: string | null;
  first_user_message?: string;
  last_message: string;
  message_count: number;
  created_at: string;
  last_updated: string;
}

export interface ConversationsListResponse {
  conversations: ConversationSummary[];
  total: number;
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  preview_url: string;
  preview_snippet?: string;
  has_extracted_text?: boolean;
}

export interface UnifiedChatResponse {
  conversation_id: string;
  message_id?: string;
  message: string;
  response: string;
  language?: SupportedLanguage;
  timestamp?: string;
  status?: string;
  attachments?: AttachmentInfo[];
  category?: string;
  suggestions?: string[];
  // Internal engineering metadata (omitted in customer privacy mode)
  intent?: IntentPrediction;
  sentiment?: 'positive' | 'negative' | 'neutral' | null;
  requires_human_review?: boolean;
  generation_mode?: string;
  llm_used?: boolean;
  retrieval?: {
    top_intent?: string;
    intent_margin?: number | null;
    sources?: RetrievalSource[];
  };
}

export type FeedbackRating = 'helpful' | 'unhelpful' | string;

export interface CustomerFeedbackPayload {
  conversation_id: string;
  message_id?: string;
  rating?: FeedbackRating;
  stars?: number;
  comment?: string;
}

export interface FeedbackAnalyticsResponse {
  total_feedback: number;
  total_star_ratings: number;
  average_rating: number;
  star_distribution: Record<number, number>;
  thumbs: {
    helpful: number;
    unhelpful: number;
  };
  recent_comments: Array<{
    id: number;
    conversation_id: string;
    message_id?: string;
    rating: string;
    stars?: number;
    comment: string;
    created_at: string;
    updated_at?: string;
  }>;
}

export interface ReportResponsePayload {
  conversation_id: string;
  message_id?: string;
  reason: string;
  details?: string;
}

export interface IntentOnlyResponse {
  customer_message: string;
  intent: string;
  category: string;
  confidence: number;
  review_required: boolean;
  status: string;
  top_candidates: IntentCandidate[];
  response: null;
  note: string;
}

export interface HistoryMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  metadata_json?: string;
  created_at: string;
  attachments?: AttachmentInfo[];
  human_agent?: boolean;
  agent_name?: string;
  category?: string;
  suggestions?: string[];
}

export interface ParsedMetadata {
  intent?: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | null;
  requires_human_review?: boolean;
  attachments?: AttachmentInfo[];
  sources?: Array<{
    doc_id?: string | number;
    intent?: string;
    similarity_score?: number;
  }>;
}

export interface HistoryResponse {
  conversation_id: string;
  messages: HistoryMessage[];
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: AttachmentInfo[];
  intent?: IntentPrediction;
  sentiment?: 'positive' | 'negative' | 'neutral' | null;
  requires_human_review?: boolean;
  retrievalSources?: RetrievalSource[];
  generationMode?: string;
  llmUsed?: boolean;
  isDemo?: boolean;
  human_agent?: boolean;
  agent_name?: string;
  category?: string;
  suggestions?: string[];
}

export interface ActiveSessionStats {
  totalTurns: number;
  userMessages: number;
  aiResponses: number;
  intentsDetected: Record<string, number>;
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
  humanReviewCount: number;
}

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TicketMessage {
  id: string;
  ticket_id: string;
  conversation_id: string;
  sender_role: 'agent' | 'customer' | 'system';
  sender_name: string;
  message: string;
  is_internal_note: boolean | number;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  conversation_id: string;
  session_token?: string;
  customer_name: string;
  reason: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_agent?: string | null;
  created_at: string;
  updated_at: string;
  messages?: TicketMessage[];
  conversation_transcript?: HistoryMessage[];
}

export interface AdminAnalyticsResponse {
  overview: {
    total_conversations: number;
    total_messages: number;
    user_messages: number;
    assistant_messages: number;
    total_attachments: number;
    total_attachment_mb: number;
    open_tickets: number;
    in_progress_tickets: number;
    resolved_tickets: number;
    reports_count: number;
    requires_review_count: number;
  };
  csat: {
    average_rating: number;
    total_ratings: number;
    total_feedback: number;
    stars_distribution: Record<number, number>;
    thumbs_up: number;
    thumbs_down: number;
  };
  intents: Array<{ intent: string; count: number }>;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  trends: Array<{
    date: string;
    conversations: number;
    messages: number;
  }>;
}

export interface KnowledgeFaq {
  id: string;
  intent: string;
  category: string;
  question: string;
  answer: string;
  keywords?: string;
  is_active?: boolean | number;
  is_system?: boolean;
  updated_at?: string;
}


