import React from "react";
import { 
  BarChart3, 
  ClipboardList, 
  LayoutDashboard, 
  Store, 
  Settings, 
  Users,
  AlertCircle
} from "lucide-react";
import Link from "next/link";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: ClipboardList, label: "Audits", href: "/audits" },
  { icon: AlertCircle, label: "Action Plans", href: "/action-plans" },
  { icon: Store, label: "Cửa hàng", href: "/stores" },
  { icon: Users, label: "Nhân sự", href: "/users" },
  { icon: BarChart3, label: "Báo cáo", href: "/reports" },
  { icon: Settings, label: "Cài đặt", href: "/settings" },
];

export const Sidebar = () => {
  return (
    <div className="w-64 bg-white h-screen border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
          M
        </div>
        <span className="font-bold text-xl text-gray-800">MAYCHA QA</span>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors group"
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-gray-800 truncate">Nguyễn Thành Tín</p>
            <p className="text-xs text-gray-500">QA Manager</p>
          </div>
        </div>
      </div>
    </div>
  );
};
