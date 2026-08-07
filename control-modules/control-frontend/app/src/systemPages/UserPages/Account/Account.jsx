// -----------------------------------------------------------
//  [*] Account — account settings page
//
//  Two columns under the navbar/sidebar frame: on the left
//  the account info card (email + role) above the password
//  change form, on the right the account activity log,
//  refreshed every 2 seconds.
//
//  Password rules are checked client-side first (min 8 chars,
//  both fields matching); the backend result lands in a toast.
//
//  Split into (root component last):
//
//    BRAND_FIELD_SX     — burgundy focus styling for fields
//    formatTimeAgo      — "5 mins ago" style timestamps
//    PasswordField      — outlined field with the eye toggle
//    AccountInfoCard    — avatar circle, email, role
//    ChangePasswordCard — the three fields + submit
//    RecentActivityCard — polled activity list
//    AccountPage        — page frame (default export)
//
//  Used by:
//    - router.jsx — route /account (via PageWrapper)
// -----------------------------------------------------------

import { useState, useEffect } from "react";
import {
  TextField,
  Button,
  IconButton,
  InputAdornment,
} from "@mui/material";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";

import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";

import LockIcon from "@mui/icons-material/Lock";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import PersonIcon from "@mui/icons-material/Person";
import HistoryIcon from "@mui/icons-material/History";


// The default MUI focus ring is blue — this pins the outline
// and label of the password fields to the brand burgundy
const BRAND_FIELD_SX = {
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgb(123, 0, 63)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "rgb(123, 0, 63)",
  },
};

// Timestamps arrive absolute; the activity list shows them
// relative ("5 mins ago")
const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};




// -----------------------------------------------------------
// PasswordField
// -----------------------------------------------------------
//
// One outlined password input with the show/hide eye button;
// the confirm field passes error/helperText through for the
// live "Passwords do not match" hint.
//
// Used by:
//   - ChangePasswordCard (below) — all three fields
// -----------------------------------------------------------

function PasswordField({ label, value, onChange, show, onToggleShow, error, helperText }) {
  return (
    <TextField
      fullWidth
      type={show ? "text" : "password"}
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      helperText={helperText}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={onToggleShow} edge="end">
              {show ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
      sx={BRAND_FIELD_SX}
    />
  );
}




// -----------------------------------------------------------
// AccountInfoCard
// -----------------------------------------------------------
//
// Used by:
//   - AccountPage (below) — top of the left column
// -----------------------------------------------------------

function AccountInfoCard({ authdata }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
          <PersonIcon sx={{ fontSize: 32, color: "rgb(123, 0, 63)" }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            {authdata?.email || "User"}
          </h2>
          <span className="text-sm text-gray-500">
            {authdata?.admin === 1 ? "Administrator" : "User"}
          </span>
        </div>
      </div>
    </div>
  );
}




// -----------------------------------------------------------
// ChangePasswordCard
// -----------------------------------------------------------
//
// Owns the whole password change flow: the three fields with
// their visibility toggles, the client-side checks and the
// POST — success and every failure end in a toast.
//
// Used by:
//   - AccountPage (below) — left column
// -----------------------------------------------------------

function ChangePasswordCard() {

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const handleChangePassword = async (e) => {
    e.preventDefault();

    // Validation
    if (!currentPassword) {
      toast.error(<b>Please enter your current password</b>);
      return;
    }
    if (!newPassword) {
      toast.error(<b>Please enter a new password</b>);
      return;
    }
    if (newPassword.length < 8) {
      toast.error(<b>New password must be at least 8 characters</b>);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(<b>New passwords do not match</b>);
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post("/api/account/change-password", {
        currentPassword,
        newPassword,
      });
      toast.success(<b>Password changed successfully</b>);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Failed to change password";
      toast.error(<b>{errorMessage}</b>);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-red-50 rounded-lg">
          <LockIcon sx={{ color: "rgb(123, 0, 63)" }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Change Password
          </h2>
          <p className="text-sm text-gray-500">
            Update your account password
          </p>
        </div>
      </div>

      <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
        <PasswordField
          label="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          show={showCurrentPassword}
          onToggleShow={() => setShowCurrentPassword(!showCurrentPassword)}
        />

        <PasswordField
          label="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          show={showNewPassword}
          onToggleShow={() => setShowNewPassword(!showNewPassword)}
        />

        <PasswordField
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          show={showConfirmPassword}
          onToggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
          error={confirmPassword !== "" && newPassword !== confirmPassword}
          helperText={
            confirmPassword !== "" && newPassword !== confirmPassword
              ? "Passwords do not match"
              : ""
          }
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={isSubmitting}
          sx={{
            mt: 2,
            py: 1.5,
            textTransform: "none",
            fontWeight: 600,
            backgroundColor: "rgb(123, 0, 63)",
            "&:hover": {
              backgroundColor: "#E64164",
            },
            "&:disabled": {
              backgroundColor: "#ccc",
            },
          }}
        >
          {isSubmitting ? "Changing Password..." : "Change Password"}
        </Button>
      </form>
    </div>
  );
}




// -----------------------------------------------------------
// RecentActivityCard
// -----------------------------------------------------------
//
// The account activity log — fetched on mount and then every
// 2 seconds for as long as the page is open.
//
// Used by:
//   - AccountPage (below) — right column
// -----------------------------------------------------------

function RecentActivityCard() {

  const [activities, setActivities] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);


  const fetchRecentActivity = async () => {
    try {
      const response = await axios.get('/api/account/recentactivity', { withCredentials: true });
      if (response.status === 200) {
        setActivities(response.data);
        setIsLoadingActivity(false);
      }
    } catch (error) {
      console.error('Failed to fetch recent activity:', error);
      setIsLoadingActivity(false);
    }
  };


  // Fetch data on mount and every 2 seconds
  useEffect(() => {
    fetchRecentActivity();
    const interval = setInterval(fetchRecentActivity, 2000);
    return () => clearInterval(interval);
  }, []);


  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 h-[550px] flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-red-50 rounded-lg">
          <HistoryIcon sx={{ color: "rgb(123, 0, 63)" }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Recent Activity
          </h2>
          <p className="text-sm text-gray-500">
            Your account activity log
          </p>
        </div>
      </div>

      <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
        {isLoadingActivity ? (
          <p className="text-gray-400 italic text-sm">Loading...</p>
        ) : activities.length > 0 ? (
          activities.map((activity) => (
            <div
              key={activity.log_id}
              className="p-3 bg-gray-50 rounded-lg border border-gray-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {activity.email || 'System'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {activity.message}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {formatTimeAgo(activity.time)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-gray-400 italic text-sm">No recent activity</p>
        )}
      </div>
    </div>
  );
}




// -----------------------------------------------------------
// AccountPage (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — route /account (via PageWrapper)
// -----------------------------------------------------------

export default function AccountPage({ authdata }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-center" />
      <Navbar authdata={authdata} />
      <div className="flex">
        <Sidebar authdata={authdata} />

        <div className="flex-1 p-6 overflow-y-auto h-[calc(100vh-105px)]">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Account Settings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your account preferences
            </p>
          </div>

          <div className="flex gap-6 items-start">
            {/* Left Column - Account Settings */}
            <div className="w-[400px]">
              <AccountInfoCard authdata={authdata} />
              <ChangePasswordCard />
            </div>

            {/* Right Column - Recent Activity */}
            <div className="w-[480px]">
              <RecentActivityCard />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="h-8 flex justify-center items-center text-white text-xs"
        style={{ background: "rgb(123, 0, 63)" }}
      >
        Copyright © | All Rights Reserved | VUKnF
      </div>
    </div>
  );
}
