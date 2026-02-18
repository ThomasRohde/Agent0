import type {Prism} from 'prism-react-renderer';

export function registerA0(prism: typeof Prism) {
  prism.languages.a0 = {
    comment: {
      pattern: /#.*/,
      greedy: true,
    },
    string: {
      pattern: /"(?:\\.|[^"\\])*"/,
      greedy: true,
    },
    keyword: /\b(?:cap|budget|import|as|let|return|call\?|do|assert|check|if|for|fn|match|map)\b/,
    builtin: /\b(?:fs\.read|fs\.write|http\.get|sh\.exec|parse\.json|get|put|patch|eq|contains|not|and|or|len|append|concat|sort|filter|find|range|join|str\.concat|str\.split|str\.starts|str\.replace|keys|values|merge)\b/,
    boolean: /\b(?:true|false)\b/,
    null: /\bnull\b/,
    number: /\b\d+(?:\.\d+)?\b/,
    operator: /->|>=|<=|==|!=|[+\-*/%><]/,
    punctuation: /[{}[\]():,]/,
  };
}
