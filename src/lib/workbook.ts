'use client';

/**
 * Show export: one .xlsx workbook with two sheets.
 *
 *   "Audience Votes"  — one row per voter (what the old CSV had)
 *   "Game Timeline"   — the show in order: every round change, question, guess,
 *                       reveal, score move, overlay and voting window, with the
 *                       running scores after each event.
 *
 * A CSV can only ever be one sheet, which is why the export moved to a real
 * workbook. This module is kept byte-identical between bachelor-gameshow and
 * bachelor-gameshow-live/web — edit both together.
 */

import writeXlsxFile from 'write-excel-file/browser';
import type { Row } from 'write-excel-file/browser';
import type { TeamColor, TimelineEvent } from './gameState';

const HEADER = { fontWeight: 'bold' as const, backgroundColor: '#E8EAF6' };

/**
 * The two apps carry timestamps differently — the server sends epoch millis,
 * the no-server app stores Firestore Timestamps — so normalise whatever arrives.
 */
function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  // Firestore Timestamp (avoid importing firestore just for the type check).
  const ts = value as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return null;
}

function fmtDateTime(value: unknown): string {
  const d = toDate(value);
  return d ? d.toLocaleString('en-IN') : '';
}

function fmtClock(value: unknown): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString('en-IN', { hour12: false }) : '';
}

/** The voter shape both apps share, loosely typed so either can pass its own. */
export interface ExportableMember {
  name: string;
  phone: string;
  upiId: string;
  team: string;
  votingRound: number;
  previousTeam: string | null;
  submittedAt: unknown;
  updatedAt: unknown;
}

/** Sheet 1 — the voter list. */
function votesSheet(members: ExportableMember[]): Row[] {
  const header: Row = [
    'Name',
    'Phone',
    'UPI ID',
    'Team',
    'Voting Round',
    'Previous Team',
    'Submitted At',
    'Updated At',
  ].map((value) => ({ value, type: String, ...HEADER }));

  const rows: Row[] = members.map((m) => [
    { value: m.name ?? '', type: String },
    // Phone numbers are text: as a number they lose leading zeros and Excel
    // renders long ones in scientific notation.
    { value: m.phone ?? '', type: String },
    { value: m.upiId ?? '', type: String },
    { value: m.team ? m.team.toUpperCase() : '', type: String },
    { value: m.votingRound ?? 0, type: Number },
    { value: m.previousTeam ? m.previousTeam.toUpperCase() : 'NONE', type: String },
    { value: fmtDateTime(m.submittedAt), type: String },
    { value: fmtDateTime(m.updatedAt), type: String },
  ]);

  return [header, ...rows];
}

/** Sheet 2 — the show, in the order it happened. */
function timelineSheet(events: TimelineEvent[], scoreCols: TeamColor[]): Row[] {
  const header: Row = [
    '#',
    'Time',
    'Round',
    'Event',
    'Team',
    'Detail',
    'Points',
    ...scoreCols.map((c) => `${c.toUpperCase()} total`),
  ].map((value) => ({ value, type: String, ...HEADER }));

  const rows: Row[] = events.map((e) => [
    { value: e.seq ?? 0, type: Number },
    { value: fmtClock(e.ts), type: String },
    { value: e.round ? e.round.toUpperCase() : '', type: String },
    { value: e.label ?? '', type: String },
    { value: e.team ? e.team.toUpperCase() : '', type: String },
    { value: e.detail ?? '', type: String },
    // undefined (not null) leaves the cell genuinely empty for non-scoring rows.
    { value: e.points ?? undefined, type: Number },
    ...scoreCols.map((c) => ({ value: e.scores?.[c] ?? 0, type: Number })),
  ]);

  return [header, ...rows];
}

const VOTE_WIDTHS = [22, 16, 24, 10, 14, 16, 22, 22];
const TIMELINE_WIDTHS = [6, 11, 12, 30, 10, 52, 10];

export interface ExportInput {
  members: ExportableMember[];
  timeline: TimelineEvent[];
  activeTeams: TeamColor[];
  episodeInfo?: string | null;
}

/** Build and download the workbook. Returns the filename that was written. */
export async function downloadShowWorkbook(input: ExportInput): Promise<string> {
  const { members, timeline, activeTeams, episodeInfo } = input;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = (episodeInfo ?? '').trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fileName = `bachelor-gameshow${slug ? `-${slug}` : ''}-${stamp}.xlsx`;

  const scoreCols = activeTeams?.length ? activeTeams : (['red', 'green', 'blue'] as TeamColor[]);

  // v4 returns a handle; `.toFile()` is what actually triggers the download.
  await writeXlsxFile([
    {
      sheet: 'Audience Votes',
      data: votesSheet(members),
      columns: VOTE_WIDTHS.map((width) => ({ width })),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Game Timeline',
      data: timelineSheet(timeline, scoreCols),
      columns: [...TIMELINE_WIDTHS, ...scoreCols.map(() => 13)].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
  ]).toFile(fileName);

  return fileName;
}
