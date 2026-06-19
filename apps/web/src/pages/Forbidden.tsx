import { useTranslation } from 'react-i18next';
import { StatusPage } from './StatusPage';

export default function Forbidden(): JSX.Element {
  const { t } = useTranslation();
  return (
    <StatusPage
      code="403"
      title={t('errorPage.forbiddenTitle')}
      body={t('errorPage.forbiddenBody')}
    />
  );
}
