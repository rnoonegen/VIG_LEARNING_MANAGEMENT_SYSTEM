import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { WeeklyUpdateDto } from '@vig/shared';
import { formatShortDate } from '@vig/shared';

/**
 * PDF weekly report (F18, Q13 — client-side react-pdf).
 *
 * Rendered in the browser rather than with headless Chrome on the API, so the
 * server keeps no rendering footprint and the data is already in the page.
 *
 * This module is loaded through a dynamic import — react-pdf is large and only
 * a parent choosing "Download PDF" should pay for it.
 *
 * It must reflect exactly what the portal shows (spec §12 "PDF Weekly Report":
 * the same approved information, not a separate reporting workflow), so it takes
 * the same DTO the screen renders.
 */

// react-pdf ships Helvetica; no font registration, no network fetch, and the
// artifact stays self-contained.
const NAVY = '#11165C';
const VIOLET = '#5B2CCB';
const INK_2 = '#5F6080';
const INK_3 = '#8D8DA5';
const LINE = '#E7E3F0';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontSize: 10,
    color: NAVY,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  eyebrow: {
    fontSize: 8,
    letterSpacing: 1.1,
    color: VIOLET,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  title: { fontSize: 22, fontFamily: 'Times-Bold', marginBottom: 4 },
  subtitle: { fontSize: 10, color: INK_2, marginBottom: 18 },
  rule: { borderBottomWidth: 1, borderBottomColor: VIOLET, marginBottom: 18 },

  glanceBox: {
    backgroundColor: '#F3EEFF',
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  glanceLabel: {
    fontSize: 8,
    letterSpacing: 0.9,
    color: VIOLET,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  glanceText: { fontSize: 10, lineHeight: 1.5 },

  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontFamily: 'Times-Bold', marginBottom: 8 },

  item: { flexDirection: 'row', marginBottom: 6, paddingRight: 8 },
  bullet: { width: 12, color: VIOLET, fontFamily: 'Helvetica-Bold' },
  itemText: { flex: 1, fontSize: 10, lineHeight: 1.45 },

  empty: { fontSize: 9, color: INK_3, fontStyle: 'italic' },

  noteBox: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
  },
  momentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  momentChip: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    color: INK_2,
    marginRight: 6,
    marginBottom: 6,
  },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: INK_3,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
  },
});

function Highlights({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>Nothing was recorded this week.</Text>
      ) : (
        items.map((text, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.itemText}>{text}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function WeeklyUpdatePdf({ update }: { update: WeeklyUpdateDto }) {
  const range = `${formatShortDate(new Date(update.weekStart))} – ${formatShortDate(new Date(update.weekEnd))}`;

  return (
    <Document
      title={`${update.studentName} — Weekly Update (${range})`}
      author="Valmiki International Gurukulam"
      subject="Weekly learning and development update"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>VALMIKI INTERNATIONAL GURUKULAM</Text>
        <Text style={styles.title}>{update.studentName}&apos;s Week</Text>
        <Text style={styles.subtitle}>{range}</Text>
        <View style={styles.rule} />

        <View style={styles.glanceBox}>
          <Text style={styles.glanceLabel}>THIS WEEK AT A GLANCE</Text>
          <Text style={styles.glanceText}>{update.summaryText}</Text>
        </View>

        <Highlights title="Learning highlights" items={update.learning.map((i) => i.highlightText)} />
        <Highlights
          title="Development highlights"
          items={update.development.map((i) => i.highlightText)}
        />

        {update.teacherNote ? (
          <View style={styles.noteBox} wrap={false}>
            <Text style={styles.sectionTitle}>Teacher&apos;s note</Text>
            <Text style={styles.itemText}>{update.teacherNote}</Text>
          </View>
        ) : null}

        {/* Images are behind short-lived signed URLs (AD-04) and would expire in a
            saved file, so moments are listed by title and date instead. */}
        {update.moments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Moments from the week</Text>
            <View style={styles.momentRow}>
              {update.moments.map((moment) => (
                <Text key={moment.id} style={styles.momentChip}>
                  {moment.title} · {formatShortDate(new Date(moment.capturedOn))}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>Valmiki LMS System · {update.studentName}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Filename that sorts chronologically and survives a shared family folder. */
export function pdfFilename(update: WeeklyUpdateDto): string {
  const name = update.studentName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${name}-Weekly-Update-${update.weekStart}.pdf`;
}

/** Renders to a Blob the caller can hand to a download link. */
export async function renderWeeklyUpdatePdf(update: WeeklyUpdateDto): Promise<Blob> {
  return pdf(<WeeklyUpdatePdf update={update} />).toBlob();
}
