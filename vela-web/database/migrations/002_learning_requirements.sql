ALTER TABLE assignment ADD submission_format VARCHAR(10) NOT NULL
 CONSTRAINT df_assignment_submission_format DEFAULT 'ANY';
GO
UPDATE assignment SET submission_format='AUDIO' WHERE task_type='IELTS_SPEAKING';
ALTER TABLE assignment ADD CONSTRAINT ck_assignment_submission_format
 CHECK(submission_format IN ('ANY','TEXT','LINK','FILE','AUDIO'));
CREATE TABLE assignment_material(
 assignment_id INT NOT NULL REFERENCES assignment(assignment_id),
 material_id INT NOT NULL REFERENCES course_material(material_id),
 PRIMARY KEY(assignment_id,material_id)
);
ALTER TABLE schedule_event ADD details NVARCHAR(MAX);
