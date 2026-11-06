import { Router } from 'express';
import { handle } from '../middleware.ts';
import { listCourses, courseDetail } from '../services/courses.ts';
import { integer } from '../utils/errors.ts';
export const catalogRouter = Router();
catalogRouter.get('/courses', handle(async req => (await listCourses(null, req.query.keyword)).filter(x => x.status === 'ACTIVE' && x.class_status === 'OPEN')));
catalogRouter.get('/courses/:id', handle(req => courseDetail(integer(req.params.id))));
