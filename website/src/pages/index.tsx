import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

const exampleCode = `# Fetch data, transform it, write results
cap { http.get: true, fs.write: true }

call? http.get { url: "https://api.example.com/todos/1" } -> response
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
let output = { fetched_title: title, status: response.status }
do fs.write { path: "out.json", data: output, format: "json" } -> artifact

return { artifact: artifact, output: output }`;

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/installation">
            Get Started
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            style={{marginLeft: '1rem'}}
            href="https://github.com/ThomasRohde/Agent0">
            GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} — A scripting language for autonomous agents`}
      description="A0 is a small, structured scripting language designed for autonomous agents. Structured values, explicit effects, capability gating, and machine-readable traces.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <section className={styles.codeSection}>
          <div className="container">
            <Heading as="h2" className="text--center">
              See it in action
            </Heading>
            <div className={styles.codeExample}>
              <CodeBlock language="bash" title="example.a0">
                {exampleCode}
              </CodeBlock>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
