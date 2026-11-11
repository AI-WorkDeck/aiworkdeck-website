// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
export const DEVELOPER_PERMISSIONS = ['file_read', 'file_write', 'network', 'editor', 'ai', 'im', 'lawfirm', 'speech', 'tasks', 'clipboard'] as const;
export type DeveloperStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
export interface DeveloperData {
  kind: 'individual' | 'organization'; displayName: string; organization: string;
  contactType: 'email' | 'phone' | 'other'; contact: string;
  experience: string; plan: string; permissions: string[];
}
export interface DeveloperProfile extends DeveloperData {
  userId: string; status: DeveloperStatus; version: number;
  contactVerification: string | null; reviewNote: string; createdAt: string; updatedAt: string;
}
