import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { getCourseDataForScorm } from '../../utils/scorm';
import scorm from 'simple-scorm-packager';
import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { authMiddleware } from '../../middlewares/auth';

export const scormRouter = new Hono<{ Bindings: HttpBindings }>()
  .use('*', authMiddleware)
  .post('/:courseId', async (c) => {
    let tmpDir: string | null = null;

    try {
      const courseId = c.req.param('courseId');

      if (!courseId) {
        return c.json(
          {
            error: 'Invalid request',
            details: 'Course ID is required',
            code: 'MISSING_COURSE_ID'
          },
          400
        );
      }

      console.log(`[SCORM] Starting SCORM generation for course: ${courseId}`);

      const courseData = await getCourseDataForScorm(courseId);

      if (!courseData) {
        return c.json(
          {
            error: 'Course not found',
            details: `No course found with ID: ${courseId}`,
            code: 'COURSE_NOT_FOUND'
          },
          404
        );
      }

      console.log(
        `[SCORM] Found course: ${courseData.title} with ${courseData.lessons?.length || 0} lessons`
      );

      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'scorm-'));
      const contentDir = path.join(tmpDir, 'scorm-content');
      await fsp.mkdir(contentDir);

      const lessons = courseData.lessons || [];

      if (lessons.length === 0) {
        return c.json(
          {
            error: 'No lessons found',
            details: 'This course has no lessons to include in the SCORM package',
            code: 'NO_LESSONS'
          },
          400
        );
      }

      console.log(`[SCORM] Creating HTML files for ${lessons.length} lessons`);

      for (const lesson of lessons) {
        const lessonHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${lesson.title}</title>
            <meta charset="UTF-8">
          </head>
          <body>
            <h1>${lesson.title}</h1>
            <div>${lesson.note || ''}</div>
          </body>
        </html>
      `;
        const lessonPath = path.join(contentDir, `lesson-${lesson.id}.html`);
        await fsp.writeFile(lessonPath, lessonHtml);
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

      console.log(`[SCORM] Creating SCORM package with config:`, config);

      const packager = new scorm(config);
      packager.source(contentDir);

      const zipPath = path.join(tmpDir, `${courseData.title.replace(/[^a-zA-Z0-9]/g, '_')}.zip`);

      console.log(`[SCORM] Zipping package to: ${zipPath}`);
      await packager.zip(zipPath);
      
      console.log(`[SCORM] Created ZIP file, starting stream...`);

      const nodeRes = c.env.outgoing;
      if (nodeRes) {
        nodeRes.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${courseData.title.replace(/[^a-zA-Z0-9]/g, '_')}.zip"`
        });
        
        const stream = fs.createReadStream(zipPath);
        stream.pipe(nodeRes);

        stream.on('close', () => {
          if (tmpDir) {
            fsp.rm(tmpDir, { recursive: true, force: true }).catch(err => {
              console.error('[SCORM] Error cleaning up temp directory after stream:', err);
            });
            tmpDir = null;
          }
        });

        return RESPONSE_ALREADY_SENT;
      }

      return c.json(
        {
          error: 'Could not send SCORM package',
          details: 'Response streaming failed',
          code: 'STREAMING_ERROR'
        },
        500
      );
    } catch (error) {
      console.error('[SCORM] Error generating SCORM package:', error);

      // Clean up temp directory on error
      if (tmpDir) {
        try {
          await fsp.rm(tmpDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('[SCORM] Error cleaning up temp directory:', cleanupError);
        }
      }

      return c.json(
        {
          error: 'Failed to generate SCORM package',
          details: error instanceof Error ? error.message : 'Unknown error occurred',
          code: 'GENERATION_ERROR'
        },
        500
      );
    }
  });