'use client';
import { useState, useEffect } from "react";
import { Modal, ModalDialog, Button } from "@mui/joy";
import axios from "axios";
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import toast from 'react-hot-toast';

const QuickRegistrationWidget = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState('');
  const [expiry, setExpiry] = useState(null);
  const [remainingTime, setRemainingTime] = useState('');
  const [showCodeModal, setShowCodeModal] = useState(false);

  // Fetch existing registration code on mount
  useEffect(() => {
    const fetchRegistrationCode = async () => {
      try {
        const response = await axios.get('/api/account/registration-code', { withCredentials: true });
        if (response.status === 200) {
          const expiryDate = new Date(response.data.validUntil * 1000);
          if (expiryDate > new Date()) {
            setCode(response.data.code);
            setExpiry(expiryDate);
            setEnabled(true);
          }
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          console.error('Failed to fetch registration code:', error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchRegistrationCode();
  }, []);

  // Handle Turn ON
  const handleTurnOn = async () => {
    try {
      const response = await axios.post('/api/account/registration-code', {}, { withCredentials: true });
      if (response.status === 200) {
        const expiryDate = new Date(Date.now() + 30 * 60 * 1000);
        setCode(response.data.code);
        setExpiry(expiryDate);
        setEnabled(true);
        toast.success(response.data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create registration code');
    }
  };

  // Handle Turn OFF
  const handleTurnOff = async () => {
    try {
      const response = await axios.delete('/api/account/registration-code', { withCredentials: true });
      if (response.status === 200) {
        setEnabled(false);
        setCode('');
        setExpiry(null);
        setRemainingTime('');
        toast.success(response.data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete registration code');
    }
  };

  // Countdown timer effect
  useEffect(() => {
    if (!enabled || !expiry) return;

    const interval = setInterval(async () => {
      const now = new Date();
      const diff = expiry - now;

      if (diff <= 0) {
        clearInterval(interval);
        await handleTurnOff();
        toast('Quick Registration expired', { icon: '⏰' });
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemainingTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, expiry]);

  // Copy code to clipboard
  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  };

  return (
    <>
      <div 
        className="flex justify-between bg-white"
        style={{
          padding: '10px',
          boxShadow: '2px 4px 10px 1px rgba(201, 201, 201, 0.47)',
          borderRadius: '15px',
          height: '100px',
        }}
      >
        <div className="flex flex-col justify-between">
          <span className="font-bold text-sm text-gray-400">Quick Registration</span>
          {isLoading ? (
            <span className="text-3xl font-light text-gray-300">—</span>
          ) : enabled ? (
            <button 
              onClick={() => setShowCodeModal(true)}
              className="bg-purple-100 text-purple-700 font-mono font-bold text-xl py-1 px-2 rounded tracking-widest hover:bg-purple-200 transition-colors cursor-pointer border-none"
            >
              {code}
            </button>
          ) : (
            <span className="text-3xl font-light text-gray-400">OFF</span>
          )}
        </div>
        
        <div className="flex flex-col justify-between items-end mr-2">
          {isLoading ? (
            <div></div>
          ) : enabled ? (
            <>
              <span className="text-sm text-orange-500 font-mono font-medium">{remainingTime}</span>
              <button 
                onClick={handleTurnOff}
                className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium py-1.5 w-20 rounded transition-colors cursor-pointer border-none"
              >
                Turn OFF
              </button>
            </>
          ) : (
            <>
              <div></div>
              <button 
                onClick={handleTurnOn}
                className="bg-green-500 hover:bg-green-600 text-white text-xs font-medium py-1.5 w-20 rounded transition-colors cursor-pointer border-none"
              >
                Turn ON
              </button>
            </>
          )}
        </div>
      </div>

      {/* Code Display Modal */}
      <Modal open={showCodeModal} onClose={() => setShowCodeModal(false)}>
        <ModalDialog
          sx={{
            width: '90vw',
            maxWidth: '600px',
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#1a1a2e',
          }}
        >
          <h2 className="text-white text-xl font-medium mb-2">Quick Registration Code</h2>
          <p className="text-gray-400 text-sm mb-6">Share this code with students to register</p>
          
          <div 
            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-mono font-bold py-6 px-8 rounded-2xl mb-6 tracking-[0.3em] select-all cursor-pointer hover:scale-105 transition-transform"
            style={{ fontSize: 'clamp(2rem, 8vw, 4rem)' }}
            onClick={copyCode}
          >
            {code}
          </div>
          
          <div className="flex items-center justify-center gap-2 text-orange-400 mb-6">
            <span className="text-lg">⏱</span>
            <span className="font-mono text-xl">{remainingTime}</span>
            <span className="text-gray-400 text-sm">remaining</span>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              onClick={copyCode}
              sx={{
                backgroundColor: '#6366f1',
                '&:hover': { backgroundColor: '#4f46e5' },
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ContentCopyIcon fontSize="small" />
              Copy Code
            </Button>
            <Button
              onClick={() => setShowCodeModal(false)}
              variant="outlined"
              sx={{
                color: '#9ca3af',
                borderColor: '#4b5563',
                '&:hover': { backgroundColor: '#374151', borderColor: '#6b7280' },
              }}
            >
              Close
            </Button>
          </div>
        </ModalDialog>
      </Modal>
    </>
  );
};

export default QuickRegistrationWidget;

