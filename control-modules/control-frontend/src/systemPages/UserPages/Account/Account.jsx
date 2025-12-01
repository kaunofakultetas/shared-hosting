"use client";
import { useState } from "react";
import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import {
  TextField,
  Button,
  IconButton,
  InputAdornment,
} from "@mui/material";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";

import LockIcon from "@mui/icons-material/Lock";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import PersonIcon from "@mui/icons-material/Person";

const AccountPage = ({ authdata }) => {
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
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-center" />
      <Navbar />
      <div className="flex">
        <Sidebar authdata={authdata} />

        <div className="flex-1 p-6 overflow-y-auto h-[calc(100vh-105px)] max-w-lg">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Account Settings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your account preferences
            </p>
          </div>

          {/* Account Info Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-6">
            <div className="flex items-center gap-4 mb-4">
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

          {/* Change Password Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg">
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
              {/* Current Password */}
              <TextField
                fullWidth
                type={showCurrentPassword ? "text" : "password"}
                label="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        edge="end"
                      >
                        {showCurrentPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgb(123, 0, 63)",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "rgb(123, 0, 63)",
                  },
                }}
              />

              {/* New Password */}
              <TextField
                fullWidth
                type={showNewPassword ? "text" : "password"}
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        edge="end"
                      >
                        {showNewPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgb(123, 0, 63)",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "rgb(123, 0, 63)",
                  },
                }}
              />

              {/* Confirm New Password */}
              <TextField
                fullWidth
                type={showConfirmPassword ? "text" : "password"}
                label="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={confirmPassword !== "" && newPassword !== confirmPassword}
                helperText={
                  confirmPassword !== "" && newPassword !== confirmPassword
                    ? "Passwords do not match"
                    : ""
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgb(123, 0, 63)",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "rgb(123, 0, 63)",
                  },
                }}
              />

              {/* Submit Button */}
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
};

export default AccountPage;
