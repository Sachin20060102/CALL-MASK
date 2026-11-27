package com.mococall.android.ui.main;

import android.content.Intent;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.mococall.android.R;
import com.mococall.android.data.SessionManager;
import com.mococall.android.ui.auth.LoginActivity;
import com.mococall.android.ui.dashboard.DashboardFragment;
import com.mococall.android.ui.dialer.DialerFragment;
import com.mococall.android.ui.history.CallHistoryFragment;
import com.mococall.android.ui.settings.SettingsFragment;

public class MainActivity extends AppCompatActivity {
    private BottomNavigationView bottomNav;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SessionManager sessionManager = new SessionManager(this);
        if (!sessionManager.isLoggedIn()) {
            startActivity(new Intent(this, LoginActivity.class));
            finish();
            return;
        }
        setContentView(R.layout.activity_main);
        bottomNav = findViewById(R.id.bottomNav);

        bottomNav.setOnItemSelectedListener(item -> {
            int id = item.getItemId();
            if (id == R.id.menu_dashboard) {
                loadFragment(new DashboardFragment());
                return true;
            } else if (id == R.id.menu_dialer) {
                loadFragment(new DialerFragment());
                return true;
            } else if (id == R.id.menu_history) {
                loadFragment(new CallHistoryFragment());
                return true;
            } else if (id == R.id.menu_settings) {
                loadFragment(new SettingsFragment());
                return true;
            }
            return false;
        });

        if (savedInstanceState == null) {
            bottomNav.setSelectedItemId(R.id.menu_dashboard);
        }
    }

    public void navigateToDialer() {
        if (bottomNav != null) {
            bottomNav.setSelectedItemId(R.id.menu_dialer);
        }
    }

    private void loadFragment(Fragment fragment) {
        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.fragmentContainer, fragment)
                .commit();
    }
}
