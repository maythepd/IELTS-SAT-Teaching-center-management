import './globals.css';
export const metadata = {
  title: 'Trung tâm học tập',
  description: 'IELTS / SAT teaching center and learning platform'
};
export default function Layout({
  children
}) {
  return <html lang="vi"><body>{children}</body></html>;
}
