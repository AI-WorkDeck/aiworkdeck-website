// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { PLUGIN_PERMISSIONS } from './plugin-manifest-platform';
/** Developers may request any permission a submitted manifest may declare (developers.ts rejects submissions outside the approved set). */
export const DEVELOPER_PERMISSIONS = PLUGIN_PERMISSIONS;
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
