import { useAppContext } from '../AppContext';

export const Toast = () => {
  const { toastMsg } = useAppContext();

  return (
    <div className={`toast ${toastMsg ? 'show' : ''}`} id="toast">
      {toastMsg}
    </div>
  );
};
