import { useTranslation } from 'react-i18next';
import { Button } from '../design';
import { StatusPage } from './StatusPage';

export default function ServerError(): JSX.Element {
  const { t } = useTranslation();
  return (
    <StatusPage
      code="500"
      title={t('errorPage.serverTitle')}
      body={t('errorPage.serverBody')}
      actions={<Button onClick={() => window.location.reload()}>{t('errorPage.reload')}</Button>}
    />
  );
}
