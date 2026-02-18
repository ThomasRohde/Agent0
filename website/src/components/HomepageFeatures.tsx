import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './HomepageFeatures.module.css';

type FeatureItem = {
  title: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Reliable by Design',
    description: (
      <>
        Structured values instead of string pipelines, explicit side effects with
        <code>call?</code> and <code>do</code>, and deny-by-default capability
        gating. An agent's first attempt is more likely correct.
      </>
    ),
  },
  {
    title: 'Built for Agents',
    description: (
      <>
        Record-first data model, deterministic execution, and machine-readable
        JSON output. Programs are easy for LLMs to generate and repair — no
        ambiguous syntax or hidden state.
      </>
    ),
  },
  {
    title: 'Observable Execution',
    description: (
      <>
        Every run produces structured JSONL traces with 16 event types.
        <code>assert</code> and <code>check</code> create evidence records.
        When something fails, the trace tells you exactly where and why.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
