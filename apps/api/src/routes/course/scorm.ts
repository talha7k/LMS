import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { getCourseDataForScorm } from '../../utils/scorm';
import scorm from 'simple-scorm-packager';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';

export const scormRouter = new Hono<{ Bindings: HttpBindings }>().post('/:courseId', async (c) => {
  const courseId = c.req.param('courseId');

  const courseData = await getCourseDataForScorm(courseId);

  if (!courseData) {
    return c.json({ error: 'Course not found' }, 404);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scorm-'));
  const contentDir = path.join(tmpDir, 'scorm-content');
  await fs.mkdir(contentDir);

  const lessons = courseData.lessons || [];

  for (const lesson of lessons) {
    const lessonHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${lesson.title}</title>
        </head>
        <body>
          <h1>${lesson.title}</h1>
          <div>${lesson.note}</div>
        </body>
      </html>
    `;
    const lessonPath = path.join(contentDir, `lesson-${lesson.id}.html`);
    await fs.writeFile(lessonPath, lessonHtml);
  }

  const config = {
    version: '1.2',
    organization: courseData.title,
    title: courseData.title,
    language: 'en-US',
    resources: lessons.map((lesson) => ({
      id: `lesson-${lesson.id}`,
      href: `lesson-${lesson.id}.html`,
      title: lesson.title
    }))
  };

  const packager = new scorm(config);
  packager.source(contentDir);

  const zipPath = path.join(tmpDir, `${courseData.title}.zip`);

  await packager.zip(zipPath);

  const zipBuffer = await fs.readFile(zipPath);

  await fs.rm(tmpDir, { recursive: true, force: true });

  const nodeRes = c.env.outgoing;
  if (nodeRes) {
    nodeRes.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${courseData.title}.zip"`
    });
    nodeRes.end(zipBuffer);
    return RESPONSE_ALREADY_SENT;
  }

  return c.json({ error: 'Could not send SCORM package' }, 500);
});
