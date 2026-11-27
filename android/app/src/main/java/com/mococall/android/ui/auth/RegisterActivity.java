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

public class RegisterActivity extends AppCompatActivity {
    private EditText etFullName;
    private EditText etEmail;
    private EditText etPassword;
    private TextView tvError;
    private Button btnRegister;
    private SessionManager sessionManager;
    private MocoCallApi api;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register);
        sessionManager = new SessionManager(this);
        api = ApiClient.create(sessionManager);

        etFullName = findViewById(R.id.etFullName);
        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        tvError = findViewById(R.id.tvError);
        btnRegister = findViewById(R.id.btnRegister);
        TextView tvGoLogin = findViewById(R.id.tvGoLogin);

        btnRegister.setOnClickListener(v -> submitRegister());
        tvGoLogin.setOnClickListener(v -> finish());
    }

    private void submitRegister() {
        String fullName = etFullName.getText().toString().trim();
        String email = etEmail.getText().toString().trim();
        String password = etPassword.getText().toString();

        if (fullName.length() < 2 || !InputValidator.isValidEmail(email) || password.length() < 8) {
            showError("Enter full name, valid email, and password (min 8 chars).");
            return;
        }

        tvError.setVisibility(View.GONE);
        btnRegister.setEnabled(false);

        api.register(new ApiModels.RegisterRequest(email, password, fullName))
                .enqueue(new Callback<ApiModels.AuthResponse>() {
                    @Override
                    public void onResponse(
                            Call<ApiModels.AuthResponse> call,
                            Response<ApiModels.AuthResponse> response) {
                        btnRegister.setEnabled(true);
                        if (response.isSuccessful() && response.body() != null) {
                            ApiModels.AuthResponse body = response.body();
                            sessionManager.saveSession(
                                    body.accessToken,
                                    body.refreshToken,
                                    body.user.email,
                                    body.user.fullName);
                            Intent intent = new Intent(RegisterActivity.this, MainActivity.class);
                            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                            startActivity(intent);
                        } else {
                            showError(ApiClient.parseErrorMessage(response, "Registration failed."));
                        }
                    }

                    @Override
                    public void onFailure(Call<ApiModels.AuthResponse> call, Throwable t) {
                        btnRegister.setEnabled(true);
                        showError("Network error: " + t.getMessage());
                    }
                });
    }

    private void showError(String msg) {
        tvError.setText(msg);
        tvError.setVisibility(View.VISIBLE);
    }
}
