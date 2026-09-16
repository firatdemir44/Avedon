import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSkill, listSkills, runSkill } from '../skills';

// Faz 1, Adım 4: hesap becerileri. Mobil hesaplayıcılar cihazda hesaplamaya
// devam eder (çevrimdışı, tuş başına anında); bu uç asistan (Adım 5) ve
// ileride web için tek doğruluk kaynağıdır.
export const skillsRouter = Router();
skillsRouter.use(requireAuth);

skillsRouter.get('/', (_req, res) => {
  res.json({ skills: listSkills() });
});

skillsRouter.post('/:name/run', (req, res) => {
  const skill = getSkill(req.params.name);
  if (!skill) return res.status(404).json({ error: 'unknown_skill' });

  const result = runSkill(skill, req.body ?? {});
  if (!result.ok) return res.status(400).json({ error: result.error, details: result.details });

  res.json({ skill: skill.name, title: skill.title, output: result.output, summary: result.summary, formula: skill.formula });
});
