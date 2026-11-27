package com.mococall.android.ui.auth;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import com.mococall.android.R;
import com.mococall.android.data.ApiClient;
import com.mococall.android.data.MocoCallApi;
import com.mococall.android.data.SessionManager;
import com.mococall.android.data.model.ApiModels;
import com.mococall.android.ui.main.MainActivity;
import com.mococall.android.util.InputValidator;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class LoginActivity extends AppCompatActivity {
    private EditText etEmail;
    private EditText etPassword;
    private TextView tvError;
    private Button btnLogin;
    private SessionManager sessionManager;
    private MocoCallApi api;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sessionManager = new SessionManager(this);
        if (sessionManager.isLoggedIn()) {
            openMain();
            return;
        }
        setContentView(R.layout.activity_login);
        api = ApiClient.create(sessionManager);

        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        tvError = findViewById(R.id.tvError);
        btnLogin = findViewById(R.id.btnLogin);
        TextView tvGoRegister = findViewById(R.id.tvGoRegister);

        btnLogin.setOnClickListener(v -> submitLogin());
        tvGoRegister.setOnClickListener(v -> startActivity(new Intent(this, RegisterActivity.class)));
    }

    private void submitLogin() {
        String email = etEmail.getText().toString().trim();
        String password = etPassword.getText().toString();
        if (!InputValidator.isValidEmail(email) || password.isEmpty()) {
            showError("Enter a valid email and password.");
            return;
        }

        tvError.setVisibility(View.GONE);
        btnLogin.setEnabled(false);

        api.login(new ApiModels.LoginRequest(email, password)).enqueue(new Callback<ApiModels.AuthResponse>() {
            @Override
            public void onResponse(Call<ApiModels.AuthResponse> call, Response<ApiModels.AuthResponse> response) {
                btnLogin.setEnabled(true);
                if (response.isSuccessful() && response.body() != null) {
                    ApiModels.AuthResponse body = response.body();
                    sessionManager.saveSession(
                            body.accessToken,
                            body.refreshToken,
                            body.user.email,
                            body.user.fullName);
                    openMain();
                } else {
                    showError(ApiClient.parseErrorMessage(response, "Authentication failed."));
                }
            }

            @Override
            public void onFailure(Call<ApiModels.AuthResponse> call, Throwable t) {
                btnLogin.setEnabled(true);
                showError("Network error: " + t.getMessage());
            }
        });
    }

    private void showError(String msg) {
        tvError.setText(msg);
        tvError.setVisibility(View.VISIBLE);
    }

    private void openMain() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }
}
