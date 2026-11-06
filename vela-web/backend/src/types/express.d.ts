export {};
declare global {
  namespace Express {
    interface Request {
      user?: {
        account_id: number;
        full_name: string;
        email: string;
        role: string;
        student_id?: number;
        teacher_id?: number;
        csrf_token: string;
      };
      requestId?: string;
    }
  }
}
