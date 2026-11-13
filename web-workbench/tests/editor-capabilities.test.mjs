// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {editorCapabilities,capabilitiesFile} from '../scripts/editor-capabilities.mjs';
test('exported editor capabilities match the vendored executor allowlist',async()=>{
 const exported=JSON.parse(await fs.readFile(capabilitiesFile,'utf8'));
 assert.deepEqual(exported,await editorCapabilities(),'run node scripts/editor-capabilities.mjs after updating vendor/core');
 // Actions the web workbench dispatches itself must stay executable.
 for(const action of ['load_document','export_document','get_document_text','find_text_locations','replace_at_position','set_track_changes','table_read','table_set_cell','insert_table','format_selection','set_paragraph_format','undo','redo','ui_command','set_revision_view'])assert.ok(exported.editorActions.includes(action),action);
});
