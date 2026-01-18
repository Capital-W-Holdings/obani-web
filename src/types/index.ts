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
