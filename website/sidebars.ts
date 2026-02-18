import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/hello-world',
        'getting-started/your-first-program',
      ],
    },
    {
      type: 'category',
      label: 'Language Reference',
      items: [
        'language/data-types',
        'language/bindings',
        'language/expressions',
        'language/control-flow',
        'language/functions',
        'language/comments',
      ],
    },
    {
      type: 'category',
      label: 'Built-in Tools',
      items: [
        'tools/overview',
        'tools/fs-read',
        'tools/fs-write',
        'tools/http-get',
        'tools/sh-exec',
      ],
    },
    {
      type: 'category',
      label: 'Standard Library',
      items: [
        'stdlib/overview',
        'stdlib/data-functions',
        'stdlib/predicates',
        'stdlib/list-operations',
        'stdlib/string-operations',
        'stdlib/record-operations',
      ],
    },
    {
      type: 'category',
      label: 'Capabilities & Security',
      items: [
        'capabilities/overview',
        'capabilities/policy-files',
        'capabilities/budgets',
      ],
    },
    {
      type: 'category',
      label: 'Evidence & Traces',
      items: [
        'evidence/assert-check',
        'evidence/traces',
      ],
    },
    {
      type: 'category',
      label: 'CLI Reference',
      items: [
        'cli/overview',
        'cli/run',
        'cli/check',
        'cli/fmt',
        'cli/trace',
      ],
    },
    {
      type: 'category',
      label: 'Error Reference',
      items: [
        'errors/exit-codes',
        'errors/diagnostic-codes',
        'errors/debugging-guide',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: [
        'examples/index',
        'examples/minimal',
        'examples/http-fetch',
        'examples/file-transform',
        'examples/shell-commands',
        'examples/iteration-and-map',
        'examples/pattern-matching',
        'examples/arithmetic',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/lexer-parser',
        'architecture/validator',
        'architecture/evaluator',
        'architecture/contributing',
      ],
    },
    'roadmap',
  ],
};

export default sidebars;
