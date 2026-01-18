// Obani Web Types

export interface Contact {
  id: string;
  userId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  location?: string;
  avatarUrl?: string;
  notes?: string;
  tags: string[];
  sectors: string[];
  needs: string[];
  offers: string[];
  howWeMet?: string;
  investmentTicketMin?: number;
  investmentTicketMax?: number;
  linkedinUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  birthday?: string;
  relationshipStrength: number;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InteractionType = 'MEETING' | 'CALL' | 'EMAIL' | 'MESSAGE' | 'SOCIAL' | 'EVENT' | 'OTHER';
export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export interface ActionItem {
  id: string;
  text: string;
  owner: 'me' | 'them' | 'both';
  dueDate?: string;
  completed: boolean;
}

export interface Interaction {
  id: string;
  userId: string;
  contactId: string;
  type: InteractionType;
  date: string;
  notes?: string;
  sentiment: Sentiment;
  keyTopics: string[];
  actionItems?: ActionItem[];
  followUpDate?: string;
  followUpNotes?: string;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
}

export type IntroductionStatus = 'SUGGESTED' | 'PENDING' | 'MADE' | 'COMPLETED' | 'DECLINED';

// Idea Pipeline
export type IdeaStage = 'INCOMING' | 'RESEARCHING' | 'IN_DISCUSSION' | 'COMMITTED' | 'COMPLETED' | 'ARCHIVED';

export interface Idea {
  id: string;
  title: string;
  description?: string;
  stage: IdeaStage;
  contactIds: string[];
  tags: string[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Introduction {
  id: string;
  userId: string;
  sourceContactId: string;
  targetContactId: string;
  status: IntroductionStatus;
  reason?: string;
  context?: string;
  matchScore?: number;
  matchType?: string;
  introducedAt?: string;
  completedAt?: string;
  outcome?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  sourceContact?: Contact;
  targetContact?: Contact;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Relationship Equity
export type EquityActionType =
  | 'INTRO_MADE' | 'INTRO_SUCCESS' | 'CONTENT_SHARED' | 'ADVICE_GIVEN' | 'REFERRAL_MADE' | 'ENDORSED' | 'FAVOR_DONE'
  | 'ASKED_INTRO' | 'ASKED_ADVICE' | 'PITCHED_SERVICE' | 'ASKED_INVESTMENT' | 'ASKED_FAVOR'
  | 'CANCELED_MEETING' | 'NO_SHOW' | 'NO_RESPONSE';

export interface EquityAction {
  id: string;
  contactId: string;
  type: EquityActionType;
  points: number;
  notes?: string;
  date: string;
  createdAt: string;
}

export type EquityStatus = 'SUPER_GIVER' | 'HEALTHY' | 'BALANCED' | 'OVERDRAWN' | 'TOXIC';

export function getEquityStatus(score: number): EquityStatus {
  if (score >= 10) return 'SUPER_GIVER';
  if (score >= 3) return 'HEALTHY';
  if (score >= -1) return 'BALANCED';
  if (score >= -5) return 'OVERDRAWN';
  return 'TOXIC';
}

export const EQUITY_POINT_VALUES: Record<EquityActionType, number> = {
  INTRO_MADE: 3,
  INTRO_SUCCESS: 5,
  CONTENT_SHARED: 1,
  ADVICE_GIVEN: 2,
  REFERRAL_MADE: 5,
  ENDORSED: 2,
  FAVOR_DONE: 2,
  ASKED_INTRO: -2,
  ASKED_ADVICE: -1,
  PITCHED_SERVICE: -3,
  ASKED_INVESTMENT: -4,
  ASKED_FAVOR: -2,
  CANCELED_MEETING: -1,
  NO_SHOW: -3,
  NO_RESPONSE: -1,
};

// Content Library
export type ContentType = 'ARTICLE' | 'PODCAST' | 'VIDEO' | 'BOOK' | 'REPORT' | 'OTHER';

export interface ContentItem {
  id: string;
  url?: string;
  title: string;
  contentType: ContentType;
  author?: string;
  publication?: string;
  publishedDate?: string;
  myNotes?: string;
  keyTakeaways: string[];
  tags: string[];
  relevantContactIds: string[];
  sharedWithContactIds: string[];
  savedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsDashboard {
  networkHealth: {
    totalContacts: number;
    activeContacts: number;
    dormantContacts: number;
    averageStrength: number;
    strengthDistribution: { strength: number; count: number }[];
  };
  interactionTrends: {
    totalInteractions: number;
    avgPerContact: number;
    byType: { type: string; count: number }[];
    monthlyTrend: { month: string; count: number }[];
  };
  introductionMetrics: {
    totalSuggested: number;
    totalMade: number;
    totalCompleted: number;
    successRate: number;
  };
  growthMetrics: {
    thisMonth: number;
    lastMonth: number;
    growthRate: number;
    monthlyTrend: { month: string; count: number }[];
  };
  atRiskContacts: Contact[];
}

// Personal Notes
export type NoteType = 'TODO' | 'IDEA' | 'INSIGHT' | 'JOURNAL' | 'OTHER';

export interface PersonalNote {
  id: string;
  title?: string;
  content: string;
  noteType: NoteType;
  tags: string[];
  priority: 1 | 2 | 3 | 4 | 5;
  dueDate?: string;
  status: 'active' | 'done' | 'archived';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// Events
export type EventType = 'CONFERENCE' | 'MEETUP' | 'DINNER' | 'WORKSHOP' | 'WEBINAR' | 'NETWORKING' | 'OTHER';

export interface NetworkEvent {
  id: string;
  name: string;
  eventType: EventType;
  date: string;
  endDate?: string;
  location?: string;
  description?: string;
  url?: string;
  contactIds: string[];
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Contact Groups
export interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  contactIds: string[];
  createdAt: string;
  updatedAt: string;
}
