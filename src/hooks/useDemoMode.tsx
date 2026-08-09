import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const DEMO_MODE_KEY = 'vittalhub_demo_mode';

export const useDemoMode = () => {
  const [isDemo, setIsDemo] = useState(() => {
    const storedDemoMode = localStorage.getItem(DEMO_MODE_KEY) === 'true';
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('demo') === 'true' || storedDemoMode;
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Sync with localStorage and URL changes
    const urlParams = new URLSearchParams(location.search);
    const demoParam = urlParams.get('demo') === 'true';
    const storedDemoMode = localStorage.getItem(DEMO_MODE_KEY) === 'true';

    if (demoParam || storedDemoMode) {
      setIsDemo(true);
      if (!storedDemoMode) {
        localStorage.setItem(DEMO_MODE_KEY, 'true');
      }
    }
  }, [location]);

  const enableDemoMode = () => {
    localStorage.setItem(DEMO_MODE_KEY, 'true');
    setIsDemo(true);
    navigate('/dashboard?demo=true');
  };

  const disableDemoMode = () => {
    localStorage.removeItem(DEMO_MODE_KEY);
    setIsDemo(false);
    navigate('/');
  };

  return {
    isDemo,
    enableDemoMode,
    disableDemoMode,
  };
};
