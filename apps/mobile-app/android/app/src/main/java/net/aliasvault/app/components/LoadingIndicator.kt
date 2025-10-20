package net.aliasvault.app.components

import android.animation.ObjectAnimator
import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import net.aliasvault.app.R

/**
 * LoadingIndicator
 *
 * A reusable loading indicator component with animated dots and a customizable message.
 * Matches the design of the React Native LoadingIndicator component.
 */
class LoadingIndicator @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : LinearLayout(context, attrs, defStyleAttr) {

    private val loadingMessage: TextView
    private val loadingDot1: View
    private val loadingDot2: View
    private val loadingDot3: View
    private val loadingDot4: View

    private var animators: List<ObjectAnimator> = emptyList()

    init {
        // Inflate the layout
        LayoutInflater.from(context).inflate(R.layout.loading_indicator, this, true)

        // Initialize views
        loadingMessage = findViewById(R.id.loadingMessage)
        loadingDot1 = findViewById(R.id.loadingDot1)
        loadingDot2 = findViewById(R.id.loadingDot2)
        loadingDot3 = findViewById(R.id.loadingDot3)
        loadingDot4 = findViewById(R.id.loadingDot4)
    }

    /**
     * Set the loading message text
     */
    fun setMessage(message: String) {
        loadingMessage.text = message
    }

    /**
     * Start the pulsing animation on the dots
     */
    fun startAnimation() {
        // Stop any existing animations
        stopAnimation()

        // Start pulsing animation on dots with staggered delays
        val newAnimators = mutableListOf<ObjectAnimator>()
        newAnimators.add(startDotAnimation(loadingDot1, 0))
        newAnimators.add(startDotAnimation(loadingDot2, 200))
        newAnimators.add(startDotAnimation(loadingDot3, 400))
        newAnimators.add(startDotAnimation(loadingDot4, 600))

        animators = newAnimators
    }

    /**
     * Stop the pulsing animation
     */
    fun stopAnimation() {
        animators.forEach { it.cancel() }
        animators = emptyList()
    }

    /**
     * Start the pulsing animation on a single dot with a delay
     */
    private fun startDotAnimation(dot: View, delayMillis: Long): ObjectAnimator {
        val animator = ObjectAnimator.ofFloat(dot, "alpha", 0.3f, 1.0f).apply {
            duration = 700
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
        }

        if (delayMillis > 0) {
            CoroutineScope(Dispatchers.Main).launch {
                delay(delayMillis)
                animator.start()
            }
        } else {
            animator.start()
        }

        return animator
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopAnimation()
    }
}
