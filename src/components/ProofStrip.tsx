import { StyleSheet, Text, View } from 'react-native';

import { WEB_VERIFIER_URL } from '../config';
import { edgeTime } from '../design/format';
import { ANCHOR_CHECK, CLAIMED_LEVEL, STEPS, UNCHECKED_LEVEL, formatCaptured, type Verdict } from '../protocol/receipt';
import { hairline, radius, space, type as t, useTheme } from '../theme';
import { Body, Busy, EdgeLabel, Field, Rule, TextLink, Title } from './ui';

type FrameState = 'passed' | 'failed' | 'empty';

function frameStates(v: Verdict | 'checking'): FrameState[] {
  if (v === 'checking') return STEPS.map(() => 'empty');
  if (v.ok) return STEPS.map(() => 'passed');
  const failed = v.stepNumber - 1;
  return STEPS.map((_, i) => (i < failed ? 'passed' : i === failed ? 'failed' : 'empty'));
}

/** A verdict as five frames, one per step of SPEC.md §6, with the verdict lines below. */
export function ProofStrip({ verdict }: { verdict: Verdict | 'checking' }) {
  const { c } = useTheme();
  const states = frameStates(verdict);
  const fill: Record<FrameState, string | undefined> = { passed: c.ok, failed: c.fail, empty: undefined };
  const summary =
    verdict === 'checking'
      ? 'Checking the receipt'
      : STEPS.map((s, i) => `${s} ${states[i] === 'empty' ? 'not reached' : states[i]}`).join(', ');

  return (
    <View style={styles.wrap}>
      <View style={styles.strip} accessible accessibilityLabel={`Proof strip: ${summary}`}>
        {STEPS.map((step, i) => (
          <View key={step} style={styles.cell}>
            <View
              style={[
                styles.frame,
                { borderColor: fill[states[i]] ?? c.line, backgroundColor: fill[states[i]] ?? 'transparent' },
              ]}
            >
              {states[i] === 'failed' && <Text style={[t.edge, styles.failName, { color: c.bg }]}>{step}</Text>}
            </View>
            <EdgeLabel color={states[i] === 'failed' ? c.fail : undefined}>{`${i + 1} ${step}`}</EdgeLabel>
          </View>
        ))}
      </View>
      {verdict === 'checking' ? <Busy label="Checking the receipt" /> : <VerdictLines v={verdict} />}
    </View>
  );
}

function VerdictLines({ v }: { v: Verdict }) {
  const { c } = useTheme();
  return (
    <View style={styles.lines} accessibilityRole="summary">
      {v.ok ? (
        <>
          <Title style={{ color: c.ok }}>Anchored in ledger {v.ledger}</Title>
          <Body selectable>Unchanged since signed by key</Body>
          <Text selectable style={[t.data, { color: c.text }]}>
            {v.key}
          </Text>
          <Field label="Existed no later than" value={`${edgeTime(v.existedNoLaterThan) ?? v.existedNoLaterThan} · ledger ${v.ledger}`} />
          <Field
            label="Device clock at capture (a claim, not evidence)"
            value={edgeTime(Number(v.deviceCaptured)) ?? formatCaptured(v.deviceCaptured)}
          />
        </>
      ) : (
        <>
          <Title style={{ color: c.fail }}>
            Failed at step {v.stepNumber}: {v.failedStep}
          </Title>
          <Body selectable>{v.reason}</Body>
        </>
      )}
      <Rule />
      <LevelLine v={v} />
      <Field
        label="Anchor checked against"
        value={
          v.hasValidatorProof
            ? `${ANCHOR_CHECK}. The receipt also has a validator proof, which this app does not check.`
            : ANCHOR_CHECK
        }
      />
      {v.hasValidatorProof && v.keyLevel !== UNCHECKED_LEVEL && <WebVerifier />}
      <Rule />
      <Text style={[t.title, { color: c.text }]}>{v.caveat}</Text>
    </View>
  );
}

function LevelLine({ v }: { v: Verdict }) {
  if (v.keyLevel !== UNCHECKED_LEVEL || !v.claimedAttestation) return <Field label="Key level" value={v.keyLevel} />;
  return (
    <View style={styles.level}>
      <Field
        label="Key level, as claimed"
        value={`${CLAIMED_LEVEL[v.claimedAttestation]}, by its ${v.claimedAttestation} attestation. Not checked by this app.`}
      />
      <WebVerifier />
    </View>
  );
}

function WebVerifier() {
  return (
    <View style={styles.level}>
      <Body muted>Checked by the web verifier.</Body>
      <TextLink title="Open the web verifier" url={WEB_VERIFIER_URL} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4] },
  strip: { flexDirection: 'row', gap: space[1] },
  cell: { flex: 1, gap: space[1] },
  frame: {
    aspectRatio: 2 / 3,
    borderWidth: hairline,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  failName: { transform: [{ rotate: '-90deg' }], width: 80, textAlign: 'center' },
  lines: { gap: space[3] },
  level: { gap: space[1] },
});
