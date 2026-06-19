import { useTranslation } from 'react-i18next';
import { StatusPage } from './StatusPage';

export default function NotFound(): JSX.Element {
  const { t } = useTranslation();
  return (
    <StatusPage
      code="404"
      title={t('errorPage.notFoundTitle')}
      body={t('errorPage.notFoundBody')}
    />
  );
}
