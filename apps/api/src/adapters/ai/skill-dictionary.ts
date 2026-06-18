export interface SkillDef {
  /** Canonical normalized name (lowercase). */
  name: string;
  display: string;
  category: 'Programming' | 'Frontend' | 'Backend' | 'Database' | 'Cloud' | 'DevOps' | 'Data' | 'Mobile';
  aliases: string[];
}

/** Dictionary the deterministic mock LLM scans resume text against. */
export const SKILL_DICTIONARY: SkillDef[] = [
  { name: 'typescript', display: 'TypeScript', category: 'Programming', aliases: ['typescript', 'ts'] },
  { name: 'javascript', display: 'JavaScript', category: 'Programming', aliases: ['javascript', 'js', 'es6'] },
  { name: 'python', display: 'Python', category: 'Programming', aliases: ['python'] },
  { name: 'go', display: 'Go', category: 'Programming', aliases: ['golang', 'go lang'] },
  { name: 'java', display: 'Java', category: 'Programming', aliases: ['java'] },
  { name: 'rust', display: 'Rust', category: 'Programming', aliases: ['rust'] },
  { name: 'react', display: 'React', category: 'Frontend', aliases: ['react', 'react.js', 'reactjs'] },
  { name: 'vue', display: 'Vue', category: 'Frontend', aliases: ['vue', 'vue.js', 'vuejs'] },
  { name: 'css', display: 'CSS', category: 'Frontend', aliases: ['css', 'tailwind', 'scss'] },
  { name: 'node.js', display: 'Node.js', category: 'Backend', aliases: ['node.js', 'nodejs', 'node'] },
  { name: 'fastify', display: 'Fastify', category: 'Backend', aliases: ['fastify'] },
  { name: 'express', display: 'Express', category: 'Backend', aliases: ['express', 'express.js'] },
  { name: 'graphql', display: 'GraphQL', category: 'Backend', aliases: ['graphql'] },
  { name: 'postgresql', display: 'PostgreSQL', category: 'Database', aliases: ['postgresql', 'postgres', 'psql'] },
  { name: 'mysql', display: 'MySQL', category: 'Database', aliases: ['mysql'] },
  { name: 'mongodb', display: 'MongoDB', category: 'Database', aliases: ['mongodb', 'mongo'] },
  { name: 'redis', display: 'Redis', category: 'Database', aliases: ['redis'] },
  { name: 'aws', display: 'AWS', category: 'Cloud', aliases: ['aws', 'amazon web services'] },
  { name: 'gcp', display: 'GCP', category: 'Cloud', aliases: ['gcp', 'google cloud'] },
  { name: 'docker', display: 'Docker', category: 'DevOps', aliases: ['docker'] },
  { name: 'kubernetes', display: 'Kubernetes', category: 'DevOps', aliases: ['kubernetes', 'k8s'] },
  { name: 'terraform', display: 'Terraform', category: 'DevOps', aliases: ['terraform'] },
  { name: 'machine learning', display: 'Machine Learning', category: 'Data', aliases: ['machine learning', 'ml', 'tensorflow', 'pytorch'] },
  { name: 'sql', display: 'SQL', category: 'Data', aliases: ['sql'] },
  { name: 'swift', display: 'Swift', category: 'Mobile', aliases: ['swift', 'ios'] },
  { name: 'kotlin', display: 'Kotlin', category: 'Mobile', aliases: ['kotlin', 'android'] },
];
